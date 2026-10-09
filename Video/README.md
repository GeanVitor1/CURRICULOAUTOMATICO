# Mascote da EmpreGatos

As artes originais estão em `output/`. Os nomes descrevem as poses criadas pelo autor; o app importa os arquivos diretamente, sem alterar os desenhos. O arquivo animado recebeu a extensão `.gif` para ser servido como imagem GIF.

| Arte                                       | Uso no app                                                       |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `escrevendo.jpeg`                          | Preparação do currículo, etapas do construtor e guia             |
| `escrevendo e olhando pra espectador.jpeg` | Login, boas-vindas do guia e início do construtor                |
| `escrevendo olhando pra direita.jpeg`      | Revisão final do currículo e das preferências                    |
| `entregando curriculo.jpeg`                | Página inicial, envio do currículo, PDF pronto e candidaturas    |
| `pensando 1.jpeg`                          | Busca de oportunidades, fontes e carregamento                    |
| `pensando 2.jpeg`                          | Comparação de opções, busca sem resultados e notificações        |
| `teve uma ideia.jpeg`                      | Cadastro, objetivos, cargos sugeridos e próximos passos          |
| `Assustado.jpeg`                           | Erros de carregamento ou de formulário                           |
| `empregado.jpeg`                           | Celebração de uma candidatura registrada como **Contratada**     |
| `GIF ANIMADO DELE PENSANDO.gif`            | Processamento de dados, geração de currículo e busca em execução |

`src/mascots.ts` reúne os arquivos e textos alternativos. `Mascot` aceita uma pose por `variant`; `Empty` aceita `mascot`. A animação tem um botão de pausa e usa uma pose estática quando o sistema pede movimento reduzido. Pausar o desenho mantém o processamento em andamento.

O símbolo da marca e o favicon continuam usando `public/mascot-original.jpeg`.
