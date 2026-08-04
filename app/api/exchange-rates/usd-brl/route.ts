const PTAX_BASE_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

type PtaxQuote = { cotacaoVenda?: number; dataHoraCotacao?: string };

function ptaxDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date).replaceAll("/", "-");
}

export function buildPtaxUrl(end = new Date()) {
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    "@dataInicial": `'${ptaxDate(start)}'`,
    "@dataFinalCotacao": `'${ptaxDate(end)}'`,
    "$select": "cotacaoVenda,dataHoraCotacao",
    "$format": "json",
  });
  return `${PTAX_BASE_URL}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${query}`;
}

export async function GET() {
  const url = buildPtaxUrl();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PTAX respondeu ${response.status}.`);
    const body = (await response.json()) as { value?: PtaxQuote[] };
    const quote = body.value
      ?.filter((item) => item.dataHoraCotacao)
      .sort((left, right) =>
        String(left.dataHoraCotacao).localeCompare(String(right.dataHoraCotacao)),
      )
      .at(-1);
    const rate = Number(quote?.cotacaoVenda);
    if (!Number.isFinite(rate) || rate <= 0 || !quote?.dataHoraCotacao) {
      throw new Error("A PTAX não retornou uma cotação válida.");
    }
    return Response.json({
      rate,
      quotedAt: `${quote.dataHoraCotacao.replace(" ", "T")}-03:00`,
      source: "Banco Central do Brasil — PTAX venda",
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar a PTAX no Banco Central." },
      { status: 502 },
    );
  }
}
