// ============================================================
// CONTAGEM DE PRAZOS (vencimento) — usado pela etapa, pelo Novo processo e pela
// Etapa 25/31. Regra única para o sistema todo:
//
// Dias corridos (ex.: Notificação Preliminar de 8 dias):
//   1. data de início (recebimento, Edital...) + 1 dia;
//   2. caindo em fim de semana ou feriado, avança até o próximo dia útil: é o Dia 1;
//   3. soma (prazo - 1) dias corridos ao Dia 1;
//   4. caindo o último dia em fim de semana ou feriado, avança até o próximo dia útil.
//
// Dias úteis (ex.: defesa de 10 dias úteis):
//   a partir do dia seguinte ao início, conta só os dias que não são sábado,
//   domingo nem feriado, até completar o prazo.
//
// Prazo 0 ("de imediato", Auto de Fiscalização): vence no próprio dia do início.
// ============================================================

// "Dia útil" = dia com expediente na Prefeitura de Divinópolis. Não contam:
// sábado, domingo, feriado nacional, feriado municipal e ponto facultativo do
// decreto anual da Prefeitura. Calculado aqui mesmo (sem consultar a internet),
// os nacionais valem para qualquer ano; os pontos facultativos são cadastrados
// ano a ano (PONTOS_FACULTATIVOS_DIVINOPOLIS).

// Feriados nacionais de data fixa (MM-DD). 20/11 (Consciência Negra) é nacional
// desde a Lei 14.759/2023.
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

// Feriados municipais fixos de Divinópolis (Lei nº 744/1967)
const FERIADOS_MUNICIPAIS_FIXOS = [
    '06-01', // Aniversário de Divinópolis (São Firmino)
    '12-08'  // Consagração à Imaculada Conceição
];

// Pontos facultativos definidos anualmente por decreto da Prefeitura.
// Acrescente o ano novo quando sair o decreto.
const PONTOS_FACULTATIVOS_DIVINOPOLIS = {
    // Decreto Municipal nº 17.080/2025
    2026: [
        '2026-01-02', // pós Ano Novo
        '2026-02-16', // segunda-feira de Carnaval
        '2026-02-17', // terça-feira de Carnaval
        '2026-02-18', // quarta-feira de Cinzas
        '2026-04-02', // quinta-feira Santa
        '2026-04-20', // véspera de Tiradentes
        '2026-06-05', // pós Corpus Christi
        '2026-10-30', // Dia do Servidor Público Municipal (transferido)
        '2026-12-07', // véspera da Imaculada Conceição
        '2026-12-24', // véspera de Natal
        '2026-12-31'  // véspera de Ano Novo
    ]
};

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function domingoDePascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia, 12);
}

function chaveData(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const cacheFeriados = {};
window.feriadosDoAno = function (ano) {
    if (cacheFeriados[ano]) return cacheFeriados[ano];
    const set = new Set();
    FERIADOS_FIXOS.forEach(md => set.add(`${ano}-${md}`));
    FERIADOS_MUNICIPAIS_FIXOS.forEach(md => set.add(`${ano}-${md}`));
    (PONTOS_FACULTATIVOS_DIVINOPOLIS[ano] || []).forEach(d => set.add(d));
    // Móveis: Sexta-feira Santa (Páscoa - 2) e Corpus Christi (Páscoa + 60,
    // feriado municipal)
    const pascoa = domingoDePascoa(ano);
    [-2, 60].forEach(delta => {
        const d = new Date(pascoa);
        d.setDate(pascoa.getDate() + delta);
        set.add(chaveData(d));
    });
    cacheFeriados[ano] = set;
    return set;
};

window.ehDiaUtil = function (data) {
    const d = new Date(data);
    const dia = d.getDay();
    if (dia === 0 || dia === 6) return false;
    return !window.feriadosDoAno(d.getFullYear()).has(chaveData(d));
};

function avancarAteDiaUtil(d) {
    while (!window.ehDiaUtil(d)) d.setDate(d.getDate() + 1);
    return d;
}

// Devolve a data (Date) do vencimento. Mantém a hora da data de início.
window.calcularVencimentoPrazo = function (dataInicio, dias, emDiasUteis = false) {
    const d = new Date(dataInicio);
    if (isNaN(d.getTime())) return new Date();
    const n = parseInt(dias, 10);
    if (!(n > 0)) return d;

    if (emDiasUteis) {
        let contados = 0;
        while (contados < n) {
            d.setDate(d.getDate() + 1);
            if (window.ehDiaUtil(d)) contados++;
        }
        return d;
    }

    d.setDate(d.getDate() + 1);
    avancarAteDiaUtil(d);           // Dia 1
    d.setDate(d.getDate() + n - 1);
    return avancarAteDiaUtil(d);    // último dia, prorrogado para o próximo útil
};
