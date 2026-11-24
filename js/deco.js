// Décor de fête partagé par l'app (index.html) et la page de liste (liste.html) : échappement HTML, avatars, anneaux, barres, icônes de cadeau, guirlande, neige.
// Aucun attribut style dans le HTML produit : la CSP des pages l'interdit (les valeurs sont posées par decorer(), en CSSOM).
'use strict';
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ---------- décor (SVG en ligne, jamais d'attribut style : voir la CSP de index.html) ----------
const initiale = nom => ([...String(nom).trim()][0] || '?').toUpperCase();
const teinte = nom => [...String(nom)].reduce((s, c) => (s * 31 + c.codePointAt(0)) % 997, 7) % 6;
const avatar = (nom, grand) => `<span class="avatar av${teinte(nom)}${grand ? ' grand' : ''}" aria-hidden="true">${e(initiale(nom))}</span>`;
const ring = (fait, total) => `<svg class="ring" viewBox="0 0 44 44" role="img" aria-label="${fait} acheté${fait > 1 ? 's' : ''} sur ${total} choisi${total > 1 ? 's' : ''}"><circle class="ring-fond" cx="22" cy="22" r="18"/>` +
  `<circle class="ring-val" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${total ? Math.round(100 * fait / total) : 0} 100" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle">${fait}/${total}</text></svg>`;
const barre = frac => `<div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(frac * 100)}"><b data-p="${Math.max(0, Math.min(100, Math.round(frac * 100)))}"></b></div>`;
const cad = s => `<svg class="cad" data-s="${s}" viewBox="0 0 24 24" aria-hidden="true"><rect class="corps" x="3" y="10" width="18" height="11" rx="1.5"/><rect class="couv" x="2" y="7" width="20" height="4" rx="1"/>` +
  '<path class="rub" d="M12 7v14M12 7c-3-4-6-2-5 0M12 7c3-4 6-2 5 0"/><path class="etoile" d="M19 1.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/></svg>';
const GUIRLANDE = '<svg class="guirlande" viewBox="0 0 360 36" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6Q45 34 90 6Q135 34 180 6Q225 34 270 6Q315 34 360 6"/>' +
  '<g class="amp"><circle cx="45" cy="22" r="5" fill="#ffb3b9"/><circle cx="135" cy="22" r="5" fill="#ffd36e"/><circle cx="225" cy="22" r="5" fill="#a8e6c0"/><circle cx="315" cy="22" r="5" fill="#a9bcff"/></g></svg>';
const RUBAN = '<span class="ruban"></span><svg class="noeud" viewBox="0 0 24 16" aria-hidden="true"><path d="M12 14C8 2 1 2 2 8c1 5 8 3 10 6zM12 14C16 2 23 2 22 8c-1 5-8 3-10 6z" fill="currentColor"/><circle cx="12" cy="13" r="2.5" fill="currentColor"/></svg>';
function avent(auj) {                                              // 24 pastilles : passées en pointillés, le jour cerclé d'or, les suivantes pleines
  const m = +auj.slice(5, 7), j = +auj.slice(8, 10);
  return '<div class="avent" aria-hidden="true">' + Array.from({ length: 24 }, (_, k) => `<b class="${m === 12 ? (k + 1 < j ? 'passe' : k + 1 === j ? 'auj' : '') : ''}">${k + 1}</b>`).join('') + '</div>';
}
const hero = (haut, corps, bas) => `<header class="hero"><div class="neige" aria-hidden="true"></div>${RUBAN}<h1 class="surtitre">${haut}</h1>${corps}${bas || ''}${GUIRLANDE}</header>`;
function decorer() {                                               // après chaque affichage : barres de progression et neige (propriétés CSS posées par le script, la CSP interdit style="")
  document.querySelectorAll('.barre > b[data-p]').forEach(b => { b.style.width = b.dataset.p + '%'; });
  const n = document.querySelector('.neige');
  if (n && !n.firstChild) for (let k = 0; k < 18; k++) {
    const i = document.createElement('i'), v = (nom, x) => i.style.setProperty(nom, x);
    v('--x', (k * 53) % 100); v('--s', 3 + (k * 7) % 4 + 'px'); v('--d', 7 + (k * 5) % 6 + 's'); v('--w', -((k * 11) % 9) + 's'); v('--dx', (k % 2 ? 1 : -1) * (10 + (k * 3) % 20) + 'px'); n.append(i);
  }
}
