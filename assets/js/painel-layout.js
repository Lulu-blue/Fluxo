// ============================================================
// PAINEL — menu lateral recolhível e rolagem lateral das tabelas
//
// Menu: o botão ☰ do cabeçalho abre/fecha o menu; o botão "‹" dentro do menu
// fecha. Em tela grande o menu recolhido libera a largura toda para a tabela
// (a escolha fica salva no navegador). Em tela pequena (até 768px) o menu
// começa fechado e abre por cima do conteúdo; clicar fora ou num item fecha.
//
// Tabelas: quando a tabela é mais larga que a tela, o quadro rola para os
// lados. Além da barra de baixo, aparece uma igual em cima da tabela (a de
// baixo fica longe quando a lista é comprida); as duas andam juntas.
// ============================================================
(function () {
    const CHAVE_MENU_RECOLHIDO = 'semac_menu_recolhido';
    const telaPequena = window.matchMedia('(max-width: 768px)');

    function layout() {
        return document.querySelector('.dashboard-layout');
    }

    function lerPreferencia() {
        try { return localStorage.getItem(CHAVE_MENU_RECOLHIDO) === '1'; } catch (e) { return false; }
    }

    function salvarPreferencia(recolhido) {
        try { localStorage.setItem(CHAVE_MENU_RECOLHIDO, recolhido ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    }

    function menuEstaVisivel() {
        const l = layout();
        if (!l) return false;
        return telaPequena.matches ? l.classList.contains('menu-aberto') : !l.classList.contains('menu-recolhido');
    }

    function definirMenu(visivel) {
        const l = layout();
        if (!l) return;
        if (telaPequena.matches) {
            l.classList.toggle('menu-aberto', visivel);
        } else {
            l.classList.toggle('menu-recolhido', !visivel);
            salvarPreferencia(!visivel);
        }
        const btn = document.getElementById('btnToggleMenu');
        if (btn) btn.setAttribute('aria-expanded', visivel ? 'true' : 'false');
    }

    // ── Rolagem lateral ─────────────────────────────────────
    function prepararRolagem(container) {
        if (container.dataset.rolagemPronta) return;
        container.dataset.rolagemPronta = '1';

        const topo = document.createElement('div');
        topo.className = 'rolagem-topo';
        topo.setAttribute('aria-hidden', 'true');
        const largura = document.createElement('div');
        topo.appendChild(largura);
        container.parentNode.insertBefore(topo, container);

        // Só copia quando a posição é diferente: assim uma barra não fica
        // reenviando a rolagem para a outra
        topo.addEventListener('scroll', () => {
            if (container.scrollLeft !== topo.scrollLeft) container.scrollLeft = topo.scrollLeft;
        });
        container.addEventListener('scroll', () => {
            if (topo.scrollLeft !== container.scrollLeft) topo.scrollLeft = container.scrollLeft;
        });

        const atualizar = () => {
            const sobra = container.scrollWidth - container.clientWidth;
            const precisa = container.clientWidth > 0 && sobra > 1;
            topo.style.display = precisa ? 'block' : 'none';
            if (precisa) {
                topo.style.width = container.clientWidth + 'px';
                largura.style.width = container.scrollWidth + 'px';
                topo.scrollLeft = container.scrollLeft;
            }
        };

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(atualizar);
            ro.observe(container);
            const tabela = container.querySelector('table');
            if (tabela) ro.observe(tabela);
        }
        // Linhas carregadas ou trocadas (lista, "carregar mais", filtros)
        new MutationObserver(atualizar).observe(container, { childList: true, subtree: true });
        window.addEventListener('resize', atualizar);
        atualizar();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const l = layout();
        if (l && !telaPequena.matches && lerPreferencia()) l.classList.add('menu-recolhido');

        document.getElementById('btnToggleMenu')?.addEventListener('click', () => definirMenu(!menuEstaVisivel()));
        document.getElementById('btnFecharMenu')?.addEventListener('click', () => definirMenu(false));
        document.getElementById('sidebarFundo')?.addEventListener('click', () => definirMenu(false));

        // Tela pequena: escolher um item do menu fecha o menu
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.addEventListener('click', () => {
            if (telaPequena.matches) definirMenu(false);
        }));

        // Passou de tela pequena para grande (ou o contrário): menu no estado certo
        telaPequena.addEventListener?.('change', () => {
            const lay = layout();
            if (!lay) return;
            lay.classList.remove('menu-aberto');
            lay.classList.toggle('menu-recolhido', !telaPequena.matches && lerPreferencia());
        });

        document.querySelectorAll('.table-container').forEach(prepararRolagem);
    });
})();
