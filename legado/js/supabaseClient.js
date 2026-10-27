// Cliente Supabase principal (sessão persistida = usuário logado do app)
// e uma fábrica de clientes "isolados", usada só na tela de Cadastro de
// Acessos: criar uma conta nova via auth.signUp() precisa de um client com
// storage próprio, senão ele substitui a sessão do admin que está logado.
(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.HUB_CONFIG || {};

  window.HUB_SUPABASE_READY =
    !!SUPABASE_URL &&
    !!SUPABASE_ANON_KEY &&
    !SUPABASE_URL.startsWith('COLE_AQUI') &&
    !SUPABASE_ANON_KEY.startsWith('COLE_AQUI');

  if (window.HUB_SUPABASE_READY) {
    window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hub-sfera-auth' }
    });
  } else {
    window.sb = null;
  }

  window.createIsolatedClient = function () {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'hub-sfera-admin-create-' + Date.now() }
    });
  };
})();
