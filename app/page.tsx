import { redirect } from "next/navigation";
import { HOME_ROUTE } from "@/src/utils/identity";

export default function HomePage() {
  redirect(HOME_ROUTE);
}