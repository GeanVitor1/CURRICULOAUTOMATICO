import { normalize } from "./engine";
/** Remove contact/identity lines; keep professional facts needed for matching. */
export function minimizeResume(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line, index) => {
      const normalized = normalize(line);
      if (
        /^(?:nome|name|endereco|address|telefone|phone|celular|email|e-mail|contato|cpf|rg|nascimento|data de nascimento|estado civil|nacionalidade)\s*:/.test(
          normalized,
        )
      )
        return false;
      if (
        index === 0 &&
        !/experiencia|curriculo|resume|ensino|formacao|atendimento|objetivo|profissional|curso|\d|[.:]/.test(
          normalized,
        ) &&
        line.split(/\s+/).length <= 6
      )
        return false;
      return true;
    })
    .join("\n")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contato removido]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[link removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento removido]")
    .replace(
      /(?:\+55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]\d{4}\b/g,
      "[telefone removido]",
    )
    .slice(0, 18000);
}
