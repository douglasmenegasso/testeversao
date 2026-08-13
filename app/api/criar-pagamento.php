<?php
/**
 * Compatibilidade para instalações que ainda apontam para criar-pagamento.php.
 * A implementação protegida fica centralizada em criar-preferencia.php para
 * evitar divergência de regras, credenciais ou validações.
 */
require __DIR__ . '/criar-preferencia.php';
