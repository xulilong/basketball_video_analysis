import { redirect } from "next/navigation";
import { ProductHome } from "@/components/ProductHome";
export default function Home() {
  if (process.env.BASKETBALL_PRODUCT === "public") redirect("/app");
  return <ProductHome />;
}
