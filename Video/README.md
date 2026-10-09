# Mascote da EmpreGatos

As artes originais estão em `output/`. Os nomes descrevem as poses criadas pelo autor; o app importa os arquivos diretamente, sem alterar os desenhos. O arquivo animado recebeu a extensão `.gif` para ser servido como imagem GIF.

| Arte                                       | Uso no app                                                       |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `escrevendo.jpeg`                          | Preparação do currículo, etapas do construtor e guia             |
| `escrevendo e olhando pra espectador.jpeg` | Boas-vindas do guia e início do construtor                       |
| `NOVOVIDEO.mp4`                            | Login e cadastro no desktop e celular, com autoplay sem som e loop |
| `escrevendo olhando pra direita.jpeg`      | Revisão final do currículo e das preferências                    |
| `entregando curriculo.jpeg`                | Envio do currículo, PDF pronto e candidaturas                    |
| `novogifcapa`                              | Animação da capa, ao lado do título principal                    |
| `pensando 1.jpeg`                          | Busca de oportunidades, fontes e carregamento                    |
| `pensando 2.jpeg`                          | Comparação de opções, busca sem resultados e notificações        |
| `teve uma ideia.jpeg`                      | Objetivos, cargos sugeridos e próximos passos                    |
| `Assustado.jpeg`                           | Erros de carregamento ou de formulário                           |
| `empregado.jpeg`                           | Celebração de uma candidatura registrada como **Contratada**     |
| `GIF ANIMADO DELE PENSANDO.gif`            | Processamento de dados, geração de currículo e busca em execução |

`src/mascots.ts` reúne os arquivos e textos alternativos. `Mascot` aceita uma pose por `variant`; `Empty` aceita `mascot`. A animação tem um botão de pausa e usa uma pose estática quando o sistema pede movimento reduzido. Pausar o desenho mantém o processamento em andamento.

O símbolo da marca e o favicon continuam usando `public/mascot-original.jpeg`.

Login e cadastro reproduzem `output/NOVOVIDEO.mp4` diretamente, sem conversão ou recompressão: H.264, 1280 × 720, 30 fps. O vídeo ocupa o enquadramento quadrado da imagem anterior, com reprodução automática sem som, loop e suporte a reprodução inline no celular. Somente a versão visível (desktop ou celular) é montada. O botão pausa no quadro atual; movimento reduzido usa `public/login-video-poster.png`, extraído do original.

A capa usa uma cópia exata de `output/novogifcapa` em `public/novogifcapa.gif`, sem recompressão: 400 × 225 pixels, 69 quadros e 4,6 segundos. O quadro 1:1 tem até 400 × 400 no desktop e se adapta à largura disponível no celular. O GIF acompanha a altura do quadro proporcionalmente, preservando o enquadramento central e recortando somente as laterais. A renderização `pixelated` mantém o traço da pixel art na ampliação. O aviso decorativo fica abaixo da animação. `public/novogifcapa-poster.png` preserva o primeiro quadro para pausa e movimento reduzido. Os demais mascotes mantêm suas poses.
