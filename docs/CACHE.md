# Cache do NEXUS

O cache Ã© automÃ¡tico e fica na memÃ³ria do servidor Node.js. Reiniciar o servidor limpa todas as entradas. Nenhuma instalaÃ§Ã£o ou alteraÃ§Ã£o no SQLite Ã© necessÃ¡ria.

| ConteÃºdo | Validade | Limite por instÃ¢ncia |
| --- | --- | --- |
| HTML, CSS, JavaScript e fundo (memÃ³ria) | 5 minutos; alteraÃ§Ãµes no arquivo geram outra versÃ£o imediatamente | 80 entradas / 32 MiB |
| HTML, CSS e JavaScript (navegador) | Revalidado com ETag; resposta 304 quando nÃ£o mudou | Gerenciado pelo navegador |
| Fundo (navegador) | 5 minutos | Gerenciado pelo navegador |
| CatÃ¡logo, detalhes e capÃ­tulos do MangaDex | 5 minutos | 200 entradas / 16 MiB |
| EndereÃ§os temporÃ¡rios de pÃ¡ginas do MangaDex | 1 minuto | Compartilha o limite de metadados |
| Imagens do MangaDex | 30 minutos | 160 entradas / 64 MiB |
| Metadados do Komga | 1 minuto | 200 entradas / 16 MiB |
| Imagens do Komga | 5 minutos | 120 entradas / 64 MiB |
| Dados complementares do Jikan | 6 horas; ausÃªncia/falha por 30 segundos | 300 entradas / 16 MiB |

Consultas simultÃ¢neas para a mesma chave compartilham uma Ãºnica chamada externa. O cache remove as entradas menos utilizadas ao atingir seu limite. Arquivos maiores que o limite sÃ£o entregues normalmente, mas nÃ£o ficam armazenados. HÃ¡ um limite de 64 consultas distintas em andamento por cache.

O catÃ¡logo recebido do MangaDex jÃ¡ alimenta o cache de detalhes e capas. As chaves de consultas incluem os parÃ¢metros, como idioma, busca, pÃ¡gina e classificaÃ§Ã£o de conteÃºdo.

SessÃ£o, perfil, favoritos, comentÃ¡rios, avaliaÃ§Ãµes e progresso nÃ£o entram neste cache. A API continua verificando autenticaÃ§Ã£o e permissÃµes antes de acessar os serviÃ§os. As respostas JSON continuam com `Cache-Control: no-store`. O cache jÃ¡ existente de Spotify/Last.fm foi preservado.

MudanÃ§as realizadas diretamente nos catÃ¡logos externos aparecem apÃ³s o prazo correspondente. Recarregar a pÃ¡gina nÃ£o forÃ§a a renovaÃ§Ã£o antecipada das APIs. Durante o desenvolvimento, HTML/CSS/JavaScript sÃ£o revalidados em cada acesso; use recarregamento forÃ§ado para renovar tambÃ©m o fundo.

## VerificaÃ§Ã£o

Execute `npm test`. Os testes de cache cobrem expiraÃ§Ã£o, limites de memÃ³ria, consultas simultÃ¢neas, recuperaÃ§Ã£o de falhas, ETag/304, alteraÃ§Ãµes nos arquivos, provedores e autenticaÃ§Ã£o apÃ³s aquecer o cache. Os testes usam provedores simulados e banco em memÃ³ria; nÃ£o dependem da conexÃ£o externa.
