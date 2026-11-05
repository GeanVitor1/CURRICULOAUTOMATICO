export function sandboxPreparationFailure(error: unknown) {
  const status=(error as {response?:{status?:number}})?.response?.status;
  return {status:"action_required" as const,retryable:true as const,message:status===402
    ? "O serviço de navegador atingiu o limite de armazenamento ou uso da hospedagem. Nenhum formulário recebeu esta candidatura. O operador precisa liberar capacidade antes de retomar."
    : "O navegador não iniciou com as proteções exigidas. Nenhum formulário recebeu esta candidatura. Revise a infraestrutura antes de retomar."};
}
