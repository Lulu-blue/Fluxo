# Migração de anexos: base64 → Cloudinary

Tira do banco os arquivos de **Anexo AR** e **Multa** que estão gravados como base64
(cerca de 118 MB, mais as cópias da Multa em `processos`, `notificacoes` e
`autos_infracao`) e troca cada um por um link do Cloudinary.

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

No Supabase: **Project Settings → Database → Connection string → Session pooler**.
Copie a string e troque `[YOUR-PASSWORD]` pela senha do banco.

Guarde o arquivo **fora da pasta do projeto**:

```bash
mkdir -p ~/backups_fluxograma
pg_dump "COLE_AQUI_A_CONNECTION_STRING" \
  --schema=public --format=custom --no-owner --no-privileges \
  -f ~/backups_fluxograma/antes_migracao_$(date +%Y%m%d_%H%M).dump
```

Confirme que o backup tem os dados dos documentos (deve aparecer uma linha):

```bash
pg_restore --list ~/backups_fluxograma/antes_migracao_*.dump | grep "TABLE DATA public documentos"
```

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
