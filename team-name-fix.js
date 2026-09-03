(() => {
  const OLD_NAME = 'Squadra 1';
  const NEW_NAME = 'Posatore Angelo';
  const cfg = window.PW_POSA_CONFIG || {};

  function replaceVisibleLabels(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(textNode => {
      if (textNode.nodeValue && textNode.nodeValue.includes(OLD_NAME)) {
        textNode.nodeValue = textNode.nodeValue.replaceAll(OLD_NAME, NEW_NAME);
      }
    });

    root.querySelectorAll?.('option').forEach(option => {
      if (option.textContent?.trim() === OLD_NAME) option.textContent = NEW_NAME;
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(added => {
        if (added.nodeType === Node.TEXT_NODE) {
          if (added.nodeValue?.includes(OLD_NAME)) {
            added.nodeValue = added.nodeValue.replaceAll(OLD_NAME, NEW_NAME);
          }
        } else if (added.nodeType === Node.ELEMENT_NODE) {
          replaceVisibleLabels(added);
        }
      });
    }
  });

  async function persistRename() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;

    try {
      const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user?.id) return;

      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile?.role !== 'office_scheduler') return;

      const { error } = await sb
        .from('teams')
        .update({ name: NEW_NAME })
        .eq('name', OLD_NAME);

      if (error) console.warn('PW Posa: rinomina squadra non persistita:', error.message);
    } catch (error) {
      console.warn('PW Posa: rinomina squadra non disponibile:', error);
    }
  }

  window.addEventListener('load', () => {
    replaceVisibleLabels();
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(persistRename, 1200);
    setTimeout(() => replaceVisibleLabels(), 1800);
  });
})();
