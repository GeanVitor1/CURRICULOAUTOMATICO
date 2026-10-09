/** Keep software features, users of a product and negated experience out of career evidence. */
const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function evidenceLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => {
    const previous = lines[index - 1] || "";
    // PDF extraction often wraps a single sentence across several lines.
    let context = line;
    for (let i = index - 1; i >= Math.max(0, index - 3); i--) {
      if (/[.!?;:]$/.test(lines[i]) || /^[●•*-]/.test(context)) break;
      context = lines[i] + " " + context;
      if (/^[●•*-]/.test(lines[i])) break;
    }
    const n = normalized(context);
    return {
      text: line,
      context: n,
      domainOnly:
        /repository\s+pattern|\brepositorios?\b|\brepository\b|integrac(?:ao|oes)\s+(?:cadastral|com|de)|(?:sistema|software|plataforma|aplicativo|modulo|portal).*(?:perfis|usuarios|clientes|vendedores|recepcao|professores|pacientes|estoque|vendas)|(?:perfis|usuarios|cadastro)\s+(?:para|de|do|com)|(?:desenvolv|implement|modelag|automatiz).*(?:sistema|software|modulo|api|funcionalidade)|^(?:backend|frontend|arquitetura e padroes|integracoes e apis|tecnologias)\s*:/.test(
          n,
        ),
      negated:
        /\b(?:sem experiencia (?:em|como)|nao (?:tenho|possuo|atuei|trabalhei)|nenhuma experiencia)\b/.test(
          n,
        ),
      previous,
    };
  });
}
