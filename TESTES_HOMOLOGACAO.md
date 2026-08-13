# Homologação das correções de segurança

**Escopo:** este roteiro vale somente para a cópia `testeversao`. Não há preparação Android nesta entrega. As mudanças de pagamento passam a ser processadas por funções de servidor; por isso, o front-end não deve ser publicado para teste antes dessas funções e das políticas de acesso.

> **Ordem obrigatória:** publique as funções, configure os segredos de teste, aplique e revise as políticas de acesso, e somente então teste o front-end. Aplicar a política antes de publicar as funções impedirá as rotinas antigas de fazer escritas sensíveis no navegador, como é desejado, mas deixará esses fluxos indisponíveis até a publicação das funções novas.

## 1. Configuração de homologação

Use `supabase/.env.example` somente como lista de nomes. Os valores reais devem ser definidos nos segredos do projeto de teste, nunca em arquivo versionado.

| Variável | Valor de homologação | Finalidade |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Sua **chave de teste** do Mercado Pago | Cria preferências de checkout no servidor. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta do webhook do app de teste | Valida o cabeçalho `x-signature`. |
| `MERCADOPAGO_WEBHOOK_URL` | URL HTTPS da função `webhook-mp` do projeto de teste | Recebe eventos do Mercado Pago. |
| `KAYLA_SITE_URL` | URL do front-end de homologação | Forma os retornos de sucesso, falha e pendência. |
| `KAYLA_ALLOWED_ORIGIN` | A mesma origem do front-end de teste | Restringe o CORS das funções. |

As quatro funções a publicar são `criar-pagamento-seguro`, `gerenciar-assinatura` e `webhook-mp`, além do compartilhado `_shared` que é incluído por elas. A configuração `supabase/config.toml` deixa JWT obrigatório para as duas primeiras; o webhook não usa JWT porque valida a assinatura HMAC enviada pelo Mercado Pago.

A documentação oficial informa que os webhooks chegam por `POST`, que a origem deve ser validada pelo cabeçalho `x-signature` e que o estado definitivo deve ser consultado na API de pagamentos a partir do ID recebido. [1] A implementação entregue faz essas três verificações antes de conceder assinatura, upgrade ou renovação.

## 2. Publicação e políticas de acesso

Publique as funções com a CLI ou pelo painel do Supabase. Antes de usar a migração, abra o editor SQL do projeto de teste e liste as políticas atuais das tabelas. Remova qualquer política anterior que conceda `INSERT`, `UPDATE` ou `DELETE` amplo a `anon`/`authenticated` nas tabelas `pagamentos`, `assinaturas`, `creditos` e `dispositivos`; os nomes dessas políticas não estão versionados neste repositório e, por isso, não podem ser removidos com segurança por uma migração genérica.

Depois aplique `supabase/migrations/20260811_rls_security_hardening.sql`. Ela preserva CRUD do próprio usuário para clientes, produtos, pedidos e empresa; deixa pagamentos, assinaturas e créditos apenas para leitura do titular; e reserva as alterações financeiras às funções de servidor. O acesso direto a eventos administrativos e visitas é bloqueado.

| Componente | Ação que deve passar no teste | Ação que deve falhar no navegador |
| --- | --- | --- |
| `clientes`, `produtos`, `pedidos`, `empresa` | CRUD do próprio usuário autenticado | Ler ou alterar registros de outro usuário. |
| `pagamentos`, `assinaturas`, `creditos` | Leitura do próprio usuário | Inserir, aprovar, renovar, reduzir ou alterar valor diretamente. |
| `dispositivos` | Leitura do próprio usuário e uso da função segura | Inserir, reativar, remover ou alterar contador diretamente. |
| `admin_events`, `visitors` | Nenhum acesso direto | Ler, inserir ou alterar por chave pública. |

## 3. Testes funcionais prioritários

Faça os testes nesta ordem, sempre com uma conta de homologação recém-criada.

| Cenário | Passos | Resultado esperado |
| --- | --- | --- |
| Cadastro e login | Cadastre, confirme o e-mail se a configuração exigir, saia e entre novamente. | A senha não aparece em `localStorage`; existe apenas a sessão gerenciada pelo Supabase. |
| Recuperação de senha | Solicite o link, abra a página, defina a nova senha e conclua. | O token desaparece da URL após ser validado; nenhum token `kayla_reset_*` é salvo no navegador. |
| Cliente e produto com texto especial | Cadastre texto como `<img src=x onerror=alert(1)>` em nome/código. | A tela exibe o texto literalmente; nenhum script é executado. |
| Compra nova | Escolha plano e dispositivo, inicie checkout com credencial de teste. | O navegador recebe apenas `init_point`; preço e pagamento pendente são gerados no servidor. |
| Webhook aprovado | No painel de testes, use a simulação de webhook do Mercado Pago para um pagamento aprovado. | A função consulta a API, confere valor/moeda/referência e somente então ativa a assinatura. |
| Webhook adulterado | Chame `webhook-mp` sem `x-signature` válido. | HTTP 401; nenhum dado de assinatura ou pagamento muda. |
| Limite de dispositivos | Ative o máximo contratado e tente ativar mais um. | A função retorna bloqueio e nenhum dispositivo/contador é alterado. |
| Remoção e redução | Remova um dispositivo e depois reduza o limite. | A contagem e eventual crédito são calculados no servidor. Se houver dispositivos demais, a redução é recusada. |
| Renovação | Inicie renovação com créditos existentes. | A confirmação final fica a cargo do webhook; o navegador não marca créditos nem estende a data por conta própria. Nesta versão, o crédito permanece em saldo e não é abatido até a implementação de cálculo e baixa parcial no servidor. |
| Offline | Com o app já carregado, desligue a internet e recarregue. | O shell e módulos locais em cache são servidos; chamadas autenticadas e checkout não são simulados offline. |

Configure uma **URL de teste HTTPS** para webhooks e use o simulador do painel do Mercado Pago para verificar a recepção. A própria documentação recomenda URLs distintas para teste e produção e disponibiliza a simulação de eventos; ela também observa que notificações de pagamentos de teste podem precisar ser verificadas por essa configuração de teste. [1]

## 4. Restrições conhecidas antes do teste

A cópia contém o código das funções e da migração, mas este ambiente não possui acesso administrativo ao projeto Supabase nem à conta Mercado Pago; portanto, a publicação dos segredos, funções, webhook e política deve ser feita por você no **projeto de teste**. Não use chave de produção nesta etapa.

O painel administrativo existente não foi reativado com acesso privilegiado. A migração deliberadamente bloqueia as tabelas administrativas para o navegador; para reabilitar um dashboard, a próxima etapa deve criar uma função administrativa autenticada e aceitar somente IDs de administradores configurados como segredo no servidor.

O crédito gerado pela redução de dispositivos continua armazenado com segurança no servidor, mas **não é abatido na renovação nesta versão**. A baixa parcial exige uma regra transacional de saldo e preço no servidor; mantê-lo sem consumo é mais seguro do que descontar ou consumir valor apenas porque o navegador exibiu um cálculo.

O antigo endpoint PHP foi reescrito sem chave no arquivo, mas só funcionará se a hospedagem PHP receber as variáveis de ambiente indicadas no cabeçalho do arquivo. O caminho recomendado para homologação é usar as Edge Functions.

## 5. Verificações realizadas nesta cópia

As verificações locais concluídas foram: sintaxe de todos os JavaScript com `node --check`; sintaxe dos dois endpoints PHP com `php -l`; parsing das quatro funções TypeScript com esbuild; `git diff --check`; e varredura de padrões de chaves de Mercado Pago e de tokens/senhas reversíveis. Não foi encontrado segredo versionado nas mudanças.

## Referências

[1] [Mercado Pago Developers — Webhooks e notificações de pagamento](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)
