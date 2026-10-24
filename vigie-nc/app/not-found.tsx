import { EcranErreur } from "@/components/EcranErreur";

// Lien cassé ou ancienne adresse : le cagou ramène à la carte.
export default function PageIntrouvable() {
  return (
    <EcranErreur
      titre="Cette page n'existe pas"
      texte="Le lien est peut-être ancien ou incomplet. La carte, elle, est toujours là."
    />
  );
}
