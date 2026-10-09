import surprised from "../Video/output/Assustado.jpeg";
import employed from "../Video/output/empregado.jpeg";
import handingResume from "../Video/output/entregando curriculo.jpeg";
import writingToYou from "../Video/output/escrevendo e olhando pra espectador.jpeg";
import writingRight from "../Video/output/escrevendo olhando pra direita.jpeg";
import writing from "../Video/output/escrevendo.jpeg";
import thinking from "../Video/output/pensando 1.jpeg";
import considering from "../Video/output/pensando 2.jpeg";
import idea from "../Video/output/teve uma ideia.jpeg";
import thinkingAnimation from "../Video/output/GIF ANIMADO DELE PENSANDO.gif";

export const mascots = {
  welcome: {
    src: "/mascot-original.jpeg",
    alt: "Mascote da EmpreGatos: gato preto de terno e gravata azul, com uma pasta",
  },
  surprised: {
    src: surprised,
    alt: "Mascote da EmpreGatos surpreso diante do currículo",
  },
  employed: {
    src: employed,
    alt: "Mascote da EmpreGatos de terno, pronto para o novo emprego",
  },
  "handing-resume": {
    src: handingResume,
    alt: "Mascote da EmpreGatos entregando um currículo",
  },
  "writing-to-you": {
    src: writingToYou,
    alt: "Mascote da EmpreGatos escrevendo e olhando para você",
  },
  "writing-right": {
    src: writingRight,
    alt: "Mascote da EmpreGatos escrevendo o currículo e olhando à direita",
  },
  writing: {
    src: writing,
    alt: "Mascote da EmpreGatos escrevendo o currículo",
  },
  thinking: {
    src: thinking,
    alt: "Mascote da EmpreGatos pensando no próximo passo",
  },
  considering: {
    src: considering,
    alt: "Mascote da EmpreGatos refletindo sobre as opções",
  },
  idea: { src: idea, alt: "Mascote da EmpreGatos com uma nova ideia" },
} as const;

export type MascotVariant = keyof typeof mascots;
export const animatedThinking = {
  src: thinkingAnimation,
  alt: "Mascote da EmpreGatos pensando enquanto prepara o resultado",
  size: 400,
};
