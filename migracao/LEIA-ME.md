# Migração de anexos: base64 → Cloudinary

Tira do banco **todo arquivo gravado como base64** na tabela `documentos` — Anexo AR,
Multa, Notificação Preliminar, Auto de Infração, Relatório Fiscal, Réplica, Certidão,
Edital, defesas e o que mais houver — e troca cada um por um link do Cloudinary.
As cópias do mesmo arquivo guardadas dentro dos JSONs (`processos`, `notificacoes`,
`autos_infracao` e as mensagens do chat) são trocadas na mesma transação.

O script descobre o que migrar pela própria coluna (`url` começando em `data:`),
então tipos novos entram sozinhos, sem precisar editar lista nenhuma.

Faça **fora do horário de expediente**. Os passos 1 e 3 leem o banco inteiro desses
arquivos e pesam num banco que já anda no limite.

---

## Como a perda de um documento é evitada

Cada documento só é trocado no banco depois de passar por todas estas etapas, nesta ordem:

| # | O que acontece | O que isso protege |
|---|---|---|
| 1 | Backup completo do banco com `pg_dump` | Qualquer erro, inclusive do próprio script |
| 2 | Cópia local do texto original exato **e** do arquivo decodificado | Cada documento, individualmente |
| 3 | As cópias são relidas do disco e conferidas por SHA-256 | Gravação em disco que falhou em silêncio |
| 4 | O base64 é validado: recodificar precisa devolver o mesmo texto | Base64 corrompido virando arquivo corrompido |
| 5 | O arquivo é enviado e **baixado de volta** do Cloudinary; o hash precisa ser idêntico | Upload incompleto ou alterado |
| 6 | O banco troca só se ainda guardar **exatamente** o conteúdo copiado (hash conferido pelo próprio banco, com a linha travada) | Arquivo trocado por alguém entre o backup e a migração |
| 7 | O banco é relido para confirmar que o link está lá | Troca que não aconteceu de verdade |

Além disso:

- **Cópias nunca são sobrescritas.** O sistema operacional recusa gravar por cima de um arquivo de backup existente.
- **Qualquer resultado inesperado para a execução inteira**, em vez de seguir adivinhando.
- **Tudo pode ser desfeito** com o comando `reverter`, usando o original exato do backup.
- **Pode ser interrompido a qualquer momento** e retomado de onde parou.

Para um documento se perder seria preciso, ao mesmo tempo, perder o `pg_dump` **e** a
cópia local **e** o Cloudinary entregar um arquivo errado que ainda assim passasse na
comparação por hash.

---

## Passo a passo

### 0. Autoteste (1 minuto, sem rede)

```bash
node migracao/migrar_anexos.mjs autoteste
```

Tem que terminar com **"Todos os testes passaram."** Se não, pare.

### 1. Backup completo do banco

No Supabase, abra o projeto e clique no botão **Connect**, no alto da tela. Abre a janela
_"Connect to your project"_, com cinco opções em cima: Framework, Server, **Direct**, ORM e MCP.
Ela começa em **Framework** — clique em **Direct (Connection string)**, o terceiro.

Role até **Session pooler** e copie a string de lá (porta 5432). Troque `[YOUR-PASSWORD]`
pela senha do banco.

A string fica assim:

```
postgresql://postgres.SEU-PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

> O Supabase muda esse menu de tempos em tempos. Se não achar o botão **Connect**,
> procure por **Project Settings → Database**, na seção de conexão. O que importa é
> pegar a string do **Session pooler** (porta 5432).

Guarde os arquivos **fora da pasta do projeto**. O backup vai **em partes**: este banco
tem linhas de vários MB (é esse o problema que a migração resolve), e um `pg_dump` único
não sobrevive à transferência numa internet comum.

Um comando só, com a string entre aspas:

```bash
~/"Área de Trabalho/Fluxograma/migracao/backup_tabelas_pesadas.sh" \
  "postgresql://postgres.SEU-PROJETO:SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

Pode deixar rodando sem acompanhar. O script faz, em ordem, a **estrutura** do banco
com os dados das tabelas leves e depois **cada tabela pesada no seu próprio arquivo**,
dentro de `~/backups_fluxograma`. Ele cuida sozinho do que derruba o `pg_dump` comum:

- usa `--inserts --rows-per-insert=50`, então **não abre um `COPY` longo**: percorre a
  tabela com um cursor, de 50 em 50 linhas, em idas e voltas curtas;
- **reescreve os parâmetros de rede** da string de conexão para valores tolerantes
  (aguenta ~10 min de travada antes de desistir). Com valores apertados, é o próprio
  computador que derruba o `pg_dump` quando o Wi-Fi engasga — o erro aparece como
  `Tempo esgotado para conexão`, parecendo culpa do servidor;
- **confere cada arquivo** com `pg_restore` antes de aceitá-lo, e só então o renomeia
  para o nome final — arquivo truncado nunca fica parecendo pronto;
- **espera a rede voltar** e **repete sozinho** até 10 vezes a parte que cair;
- **pula o que já está íntegro**, então pode rodar de novo quantas vezes precisar;
- termina em `Todas as tabelas pedidas estão salvas e conferidas.` ou lista o que faltou.

Para refazer só uma parte, passe o nome dela (`estrutura` ou o nome da tabela):

```bash
~/"Área de Trabalho/Fluxograma/migracao/backup_tabelas_pesadas.sh" "$CONN" documentos
```

**Confira no final** que está tudo íntegro — é esta a verificação que importa, não o
tamanho do arquivo:

```bash
cd ~/backups_fluxograma
for f in antes_migracao_*.dump; do
  printf '%-45s %6s  ' "$f" "$(du -h "$f" | cut -f1)"
  pg_restore -f /dev/null "$f" >/dev/null 2>&1 && echo "ÍNTEGRO" || echo "QUEBRADO"
done
```

**Apague os arquivos QUEBRADOS.** Um `pg_dump` interrompido deixa o arquivo escrito pela
metade e ele não restaura nada — guardá-lo só cria a falsa impressão de ter backup.
Ao final têm que estar ÍNTEGROS: `estrutura`, `documentos`, `historico_etapas`,
`processos`, `notificacoes`, `autos_infracao` e `chats_interface_juridica`.

#### Se mesmo assim ficar caindo

O gargalo é o link, não o Supabase. Vale conferir a velocidade real:

```bash
curl -4 -s -o /dev/null -w 'velocidade: %{speed_download} B/s\n' \
  "https://speed.cloudflare.com/__down?bytes=20000000" --max-time 60
```

Abaixo de uns 500 kB/s, o backup leva muitos minutos e cada travada vira uma tentativa
perdida. Nessa situação: cabo de rede em vez de Wi-Fi, ou mais perto do roteador, ou
fora do horário de pico da rede compartilhada. O script repete sozinho, então o pior
caso é demorar — ele não perde o que já conseguiu.

> **A conexão direta (sem pooler) não é alternativa:** ela só atende em IPv6, e esta
> rede não tem. Por isso o caminho é o Session pooler.

Vale lembrar que o próprio script de migração guarda, em `migracao/backup/`, **duas cópias
de cada arquivo** antes de trocar qualquer coisa — o `pg_dump` é a rede de segurança a
mais, para o caso de algo fora dos anexos dar errado.

### 2. Preparar o banco

No SQL Editor do Supabase, rode o arquivo **`migracao/01_preparar.sql`** inteiro.

Rode também **`migracao/02_conferir.sql`** e guarde o resultado: é a foto do "antes".

### 3. Fazer o backup local e conferir

```bash
node migracao/migrar_anexos.mjs conferir
```

Pede CPF e senha de um usuário do sistema. **Não altera nada** no banco nem no Cloudinary.

No final aparece um resumo. Leia com atenção a lista **"Documentos que merecem atenção"**:
esses não vão ser migrados e continuam intactos no banco, com backup feito.

Abra alguns arquivos de `migracao/backup/arquivos/` para ver que abrem normalmente.

### 4. Piloto com 5 documentos

```bash
node migracao/migrar_anexos.mjs migrar --limite 5
```

Pede para digitar `MIGRAR`. A saída mostra o número do processo de cada documento.

**Abra esses processos no sistema** e confira:
- o "Visualizar" do AR abre o arquivo certo;
- a Multa abre na etapa 15;
- a Notificação Preliminar e o Auto de Infração abrem pelo botão Imprimir / PDF;
- o PDF unificado da etapa 15 inclui a Multa.

Só siga se estiver tudo certo.

### 5. Migrar o restante

```bash
node migracao/migrar_anexos.mjs migrar
```

Se parar no meio (queda de internet, erro, `Ctrl+C`), **é só rodar de novo**: ele
continua de onde parou e não reenvia o que já foi.

A qualquer momento, sem rede:

```bash
node migracao/migrar_anexos.mjs status
```

### 6. Conferir o "depois"

Rode de novo **`migracao/02_conferir.sql`**:

- consulta 1: `em_base64` zerado (ou só os listados como problema);
- consultas 3 e 4: **vazias**.

### 7. Usar o sistema normalmente por uns dias

Pelo menos uma semana abrindo ARs e Multas antigos. Nesse período o `reverter`
continua disponível.

### 8. Finalizar

Rode **`migracao/03_finalizar.sql`**, que remove as funções temporárias.

### 9. Liberar o espaço (passo à parte)

A migração **não reduz** o tamanho do banco sozinha — pode até aumentar um pouco
por algum tempo, porque o Postgres guarda a versão antiga até limpar.
O espaço só volta com um `VACUUM FULL`, feito separadamente e fora do expediente.

---

## Se precisar desfazer

Um documento:

```bash
node migracao/migrar_anexos.mjs reverter --id <id-do-documento>
```

Todos os migrados:

```bash
node migracao/migrar_anexos.mjs reverter --todos
```

Pede para digitar `REVERTER`. Devolve o base64 original exato do backup, conferido por
hash pelo banco. Só desfaz documentos que ainda estão com o link que a migração colocou:
se alguém anexou outro arquivo depois, ele não é sobrescrito.

O id de cada documento está em `migracao/backup/manifesto.json`.

---

## Guarde os backups

**Não apague** `migracao/backup/` nem o arquivo `.dump`, nem depois de tudo pronto.
Depois da migração, o Cloudinary passa a ser o único lugar com esses arquivos; essas
cópias são a garantia caso algo aconteça com a conta de lá.

A pasta contém documentos com **dados pessoais de contribuintes**. Ela já está no
`.gitignore` e não vai para o GitHub, mas trate o computador e qualquer cópia dela
com o mesmo cuidado.
