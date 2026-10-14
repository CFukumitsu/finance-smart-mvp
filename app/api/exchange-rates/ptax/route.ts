// PTAX venda de moedas além do dólar (o dólar continua em /usd-brl). Usa o
// boletim de fechamento, que é a PTAX oficial do dia.
const PTAX_BASE_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

export const PTAX_CURRENCIES = ["EUR", "GBP"] as const;

type PtaxQuote = {
  cotacaoVenda?: number;
  dataHoraCotacao?: string;
  tipoBoletim?: string;
};

function ptaxDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date).replaceAll("/", "-");
}

export function buildCurrencyPtaxUrl(currency: string, end = new Date()) {
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    "@moeda": `'${currency}'`,
    "@dataInicial": `'${ptaxDate(start)}'`,
    "@dataFinalCotacao": `'${ptaxDate(end)}'`,
    "$select": "cotacaoVenda,dataHoraCotacao,tipoBoletim",
    "$format": "json",
  });
  return `${PTAX_BASE_URL}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${query}`;
}

export async function GET(request: Request) {
  const currency = new URL(request.url).searchParams.get("currency")?.trim().toUpperCase() ?? "";
  if (!(PTAX_CURRENCIES as readonly string[]).includes(currency)) {
    return Response.json({ error: "Moeda sem cotação PTAX disponível." }, { status: 400 });
  }

  try {
    const response = await fetch(buildCurrencyPtaxUrl(currency), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PTAX respondeu ${response.status}.`);
    const body = (await response.json()) as { value?: PtaxQuote[] };
    const quote = body.value
      ?.filter((item) => item.dataHoraCotacao && item.tipoBoletim?.startsWith("Fechamento"))
      .sort((left, right) =>
        String(left.dataHoraCotacao).localeCompare(String(right.dataHoraCotacao)),
      )
      .at(-1);
    const rate = Number(quote?.cotacaoVenda);
    if (!Number.isFinite(rate) || rate <= 0 || !quote?.dataHoraCotacao) {
      throw new Error("A PTAX não retornou uma cotação válida.");
    }
    return Response.json({
      currency,
      rate,
      quotedAt: `${quote.dataHoraCotacao.replace(" ", "T")}-03:00`,
      source: "Banco Central do Brasil — PTAX venda (fechamento)",
    });
  } catch {
    return Response.json(
      { error: `Não foi possível consultar a PTAX ${currency}/BRL no Banco Central.` },
      { status: 502 },
    );
  }
}
