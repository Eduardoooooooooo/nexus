# Biblioteca, leitor e controle de conteúdo

## Dados salvos por conta

O NEXUS guarda no SQLite favoritos, listas de mangás, status e progresso de leitura, avaliações, reações, comentários, preferências do catálogo e do leitor, perfil e sugestões. Os dados continuam disponíveis ao entrar na mesma conta em outro navegador que use este servidor.

O catálogo principal usa o provedor padrão configurado pela aplicação e capítulos em português do Brasil. Os seletores técnicos de fonte e idioma não aparecem para o usuário.

## Leitor

O leitor oferece página anterior/próxima, capítulo anterior/próximo, tela cheia, zoom, modo paginado e rolagem contínua. As setas do teclado mudam de página, Page Up e Page Down mudam de capítulo e o gesto horizontal funciona em telas de toque. Páginas do modo contínuo usam carregamento adiado.

## Conteúdo por idade

Obras explícitas ficam ocultas por padrão. A conta precisa ser confirmada como adulta e criar um PIN de quatro números para exibi-las. O PIN é armazenado como hash. Cinco tentativas incorretas bloqueiam novas tentativas por 15 minutos. A redefinição do PIN exige a senha da conta.

Contas de menores não recebem obras explícitas nem obras sem classificação conhecida. A API também verifica capas, páginas e URLs diretas; a interface não é a única barreira.

## Migração

A migração `user_version = 2` acrescenta os dados de perfil e preferências à tabela `users` e cria as tabelas `manga_state`, `manga_playlists`, `manga_playlist_items`, `reader_progress`, `manga_catalog`, `manga_chapters`, `comments`, `comment_reports` e `suggestions`. Ela preserva os usuários existentes e roda uma única vez.

## Limitações atuais

- A disponibilidade de capítulos em português depende do catálogo remoto.
- Obras do Komga sem classificação ficam bloqueadas para menores, conforme a regra conservadora para classificação desconhecida.
- A foto de perfil aceita PNG, JPEG ou WebP com até 400 KB e é armazenada no SQLite.
- Denúncias e sugestões aparecem no painel administrativo; o fluxo de moderação ainda não envia notificações externas.
