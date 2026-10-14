import { redirect } from "next/navigation";

// O cadastro de ativos passou a fazer parte da Carteira; mantém links antigos.
export default function InvestmentAssetsPage() {
  redirect("/investments/portfolio#ativos");
}