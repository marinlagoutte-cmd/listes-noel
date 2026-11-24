'use strict';
// Liste partagée en lecture seule : tout vient de l'adresse (#…), relu et nettoyé par Core.decoderListe ; chaque texte passe par e() avant l'affichage.
const l = Core.decoderListe(location.hash);
const app = document.getElementById('app');
if (!l) {
  document.title = "Lien non valide";
  app.innerHTML = hero('Liste de Noël', "<p class=\"mot\">Ce lien n'est pas valide.</p><p>Demande à la personne de te le renvoyer.</p>");
} else {
  const titre = l.nom ? `Liste de Noël de ${l.nom}` : 'Liste de Noël';
  document.title = titre;
  const idees = l.idees.map((i, k) => [i, k]).sort((a, b) => (!!b[0].favori - !!a[0].favori) || a[1] - b[1]).map(x => x[0]);
  const pr = l.profil, li = (t, v) => (v ? `<dt>${t}</dt><dd>${e(v)}</dd>` : '');
  app.innerHTML = hero(e(titre), `<p class="mot">${idees.length ? `${idees.length} idée${idees.length > 1 ? 's' : ''}` : 'Aucune idée pour l\'instant.'}</p>`) +
    `<div class="proprio"><b>${e(l.nom || 'Cette personne')}</b> est le ou la propriétaire de cette liste. Tu la regardes en lecture seule : tu ne peux pas la modifier.</div>` +
    (Core.profilRempli(pr) ? `<div class="carte apropos"><b>À savoir</b>${pr.surprise ? ' <span class="surprends">🎁 Surprends-moi !</span>' : ''}<dl>${li('Tailles', pr.tailles)}${li('Goûts', pr.gouts)}${li('À éviter', pr.eviter)}${li('Commentaire', pr.commentaire)}</dl></div>` : '') +
    idees.map(i => `<article class="carte idee s-idee">${cad('idee')}<div class="corps-idee"><div class="t">${i.favori ? '<span class="fav" role="img" aria-label="coup de cœur">★</span> ' : ''}${e(i.texte)}</div>` +
      `<div class="m">${i.prix != null ? `environ ${e(Core.eur(i.prix))}` : 'prix ?'}${i.occasion ? ` · <span class="occ ${i.occasion}">${Core.libOcc(i.occasion)}</span>` : ''}</div>${i.note ? `<div class="m">${e(i.note)}</div>` : ''}</div>` +
      (i.url ? `<div class="actions"><a class="btn plat petit" href="${e(i.url)}" target="_blank" rel="noopener noreferrer">Voir sur le site</a></div>` : '') + '</article>').join('') +
    '<button class="btn" id="copier" type="button">Copier le lien (pour l\'ajouter dans mon app)</button>' +
    '<p class="aide">Cette liste est contenue dans l\'adresse de la page : rien n\'est enregistré sur un serveur.</p>';
  const c = document.getElementById('copier');
  c.addEventListener('click', () => (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(
    () => { c.textContent = 'Lien copié : colle-le dans Listes de Noël (Ajouter une personne › Importer)'; },
    () => { c.textContent = "Copie l'adresse de la page à la main (menu du navigateur)"; }));
}
decorer();
