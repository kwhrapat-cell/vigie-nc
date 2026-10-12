import { CarteLive } from "@/components/CarteLive";

// Écran 1 — carte en direct, centrée sur l'utilisateur. Tout se passe côté
// navigateur (position, temps réel) : voir components/CarteLive.tsx.
export default function CartePage() {
  return <CarteLive />;
}
