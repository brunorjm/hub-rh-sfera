import { redirect } from "next/navigation";

// O hub (telas antigas) mora em /hub; esta rota ficou só como atalho.
export default function PaginaInicio() {
  redirect("/hub");
}
