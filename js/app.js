'use strict';
// Interface de « Listes de Noël » : un écran par adresse (#/, #/p/ID, #/acheter…), données dans localStorage.
// La logique pure est dans core.js (testée) ; ici, seulement l'affichage et les actions.
const CLE = 'noel.v1';
const A = window.NoelAndroid || null;   // pont Android (partage, presse-papiers, petit navigateur) ; absent sur Mac
let D;                                  // toutes les données
let collage = null;                     // réponse collée en cours de relecture : {id, idees}
let importe = null;                     // liste reçue par lien, en cours de relecture : {liste, existant}
let derniere = null;

function charger() {
  let brut = null;
  try { brut = localStorage.getItem(CLE); D = Core.normaliser(brut && JSON.parse(brut)); }
  catch (e) {
    try { localStorage.setItem(CLE + '.illisible', brut); } catch (e2) { /* tant pis */ }   // on garde l'original avant de l'écraser
    D = Core.normaliser(null);
  }
  if (!D.site) D.site = Core.siteDepuisPage(location.href);          // page publiée : les listes renvoyées par un proche pointent vers ce même site
}
function sauver() {
  D.groupes = Core.groupes(D);                                       // un groupe créé par une personne ou à la main reste enregistré
  try { localStorage.setItem(CLE, JSON.stringify(D)); } catch (e) { toast("Impossible d'enregistrer sur cet appareil."); }
}

const $ = s => document.querySelector(s);
const eurs = x => (x == null ? '—' : Core.eur(x));
const personne = id => D.personnes.find(p => p.id === id);
const plur = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
let minuteur;
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(minuteur); minuteur = setTimeout(() => el.classList.remove('on'), 2600);
}
function copier(t) {
  if (A) { A.copier(t); return Promise.resolve(); }
  return (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => {
    const x = document.createElement('textarea'); x.value = t; document.body.append(x); x.select(); document.execCommand('copy'); x.remove();
  });
}
const PEUT_ENVOYER = !!(A || navigator.share);   // feuille de partage disponible (Android, navigateur mobile) ; sinon on copie
const partager = (t, sujet) => (A ? Promise.resolve(A.partager(t, sujet)) : navigator.share ? navigator.share({ text: t, title: sujet }).catch(() => {})
  : copier(t).then(() => toast('Copié : colle-le dans WhatsApp, Messages ou ton mail.')));
const demandeur = () => D.prenom || (D.personnes.find(p => p.moi) || {}).nom || '';   // qui écrit dans les demandes envoyées

// ---------- morceaux d'affichage ----------
const retour = '<a class="retour" href="#/" data-act="retour">‹ Retour</a>';
const chip = (classe, texte) => `<span class="chip ${classe}">${e(texte)}</span>`;
const prixTxt = i => (i.prixReel != null ? `${eurs(i.prixReel)} réel` : i.prix != null ? `~${eurs(i.prix)}` : 'prix ?');
const occHtml = i => (i.occasion ? ` · <span class="occ ${i.occasion}">${Core.libOcc(i.occasion)}</span>` : '');
const lienHtml = i => (i.url ? ` · <a href="${e(i.url)}" target="_blank" rel="noopener">lien</a>` : '');
function bilanHtml(b) {
  const neg = b.reste != null && b.reste < 0;
  return `<div class="bilan"><div><span>Budget</span><b>${eurs(b.budget)}</b></div><div><span>Engagé</span><b>${eurs(b.engage)}</b></div>` +
    `<div class="${neg ? 'neg' : ''}"><span>${neg ? 'Dépassé de' : 'Reste'}</span><b>${b.reste == null ? '—' : eurs(Math.abs(b.reste))}</b></div></div>`;
}
function libStatut(p, auj) {
  if (p.statut === 'a_demander') return 'À demander';
  if (p.statut === 'recue') return 'Réponse reçue';
  const j = Core.joursSansReponse(p, auj);
  return `${p.relanceLe ? 'Relancée' : 'Demandée'} ${j === 0 ? "aujourd'hui" : `il y a ${j} j`}`;
}
const ETAPE = { idee: 'Choisir', choisi: 'Acheté', achete: 'Emballé', emballe: 'Offert' };

const fusionProfil = (a, b) => Core.profilNet({ tailles: b.tailles || a.tailles, gouts: b.gouts || a.gouts, eviter: b.eviter || a.eviter, surprise: a.surprise || b.surprise, commentaire: b.commentaire || a.commentaire });

function carte(p, dues, auj) {
  const b = Core.bilan(p), due = dues.has(p.id), c = Core.compteurs([p]);
  const info = [plur(p.idees.length, 'idée'), b.reste == null ? '' : b.reste < 0 ? `dépassé de ${eurs(-b.reste)}` : `reste ${eurs(b.reste)}`].filter(Boolean).join(' · ');
  const actions = p.moi || p.partage ? '' : p.statut === 'a_demander' ? `<a class="btn" href="#/p/${p.id}/demander">Demander sa liste</a>`
    : p.statut === 'demandee' ? (due ? `<a class="btn" href="#/p/${p.id}/demander">Relancer</a>` : '') + `<a class="btn ${due ? 'plat' : ''}" href="#/p/${p.id}/coller">Coller la réponse</a>` : '';
  const etat = p.moi ? chip('moi', 'Ma liste · propriétaire : moi') : p.partage ? chip('st-recue', 'Liste reçue le ' + (p.partage.maj ? Core.dateCourte(p.partage.maj) : '—')) : chip('st-' + p.statut, libStatut(p, auj));
  return `<article class="carte ${due ? 'due' : ''} ${p.moi ? 'moi' : ''}"><a class="lien" href="#/p/${p.id}">${avatar(p.nom)}<div><div class="nom">${e(p.nom)}</div>` +
    `<div class="ligne">${etat} ${e(p.moi ? plur(p.idees.length, 'idée') : info)}</div></div>${!p.moi && !p.partage && c.choisis ? ring(c.achetes, c.choisis) : ''}</a>${actions}</article>`;
}

// ---------- groupes ----------
const optionsGroupes = () => [...new Set(['Famille', 'Amis', ...Core.groupes(D)])];
function champGroupe(valeur) {
  const opts = optionsGroupes(), v = opts.includes(valeur) ? valeur : opts[0];
  return `<label>Groupe<select name="groupe">${opts.map(g => `<option value="${e(g)}" ${g === v ? 'selected' : ''}>${e(g)}</option>`).join('')}<option value="__nouveau">+ Nouveau groupe…</option></select></label>` +
    '<label class="nouveau" hidden>Nom du nouveau groupe<input name="groupeNouveau" autocomplete="off"></label>';
}
const groupeChoisi = f => (f.get('groupe') === '__nouveau' ? String(f.get('groupeNouveau') || '').trim() : f.get('groupe')) || 'Famille';

// ---------- écrans ----------
function vueAccueil() {
  const auj = Core.aujourdhui(), j = Core.joursAvantNoel(auj);
  const rel = Core.relances(D.personnes, auj, D.delai), dues = new Set(rel.map(r => r.personne.id));
  const autres = D.personnes.filter(p => !p.moi), cp = Core.compteurs(autres);
  const entete = hero('Listes de Noël', j === 0 ? '<div class="compte"><b>Joyeux Noël !</b></div>' : `<div class="compte"><b>J-${j}</b><span>${j === 1 ? 'Noël demain' : 'avant Noël'}</span></div>`, avent(auj));
  const resume = autres.length ? bilanHtml(Core.bilanTotal(autres)) + (cp.choisis ? barre(cp.avancement) + `<p class="legende">${cp.achetes} acheté${cp.achetes > 1 ? 's' : ''} sur ${cp.choisis} choisi${cp.choisis > 1 ? 's' : ''} · ${cp.offerts} offert${cp.offerts > 1 ? 's' : ''}</p>` : '') : '';
  return entete + resume +
    (rel.length ? `<p class="alerte">${plur(rel.length, 'personne')} sans réponse depuis ${D.delai} jours ou plus : pense à relancer.</p>` : '') +
    D.personnes.filter(p => p.moi).map(p => carte(p, dues, auj)).join('') +
    Core.groupes(D).map(g => { const gens = D.personnes.filter(p => !p.moi && p.groupe === g);
      return `<h2>${e(g)}</h2>` + (gens.length ? gens.map(p => carte(p, dues, auj)).join('')
        : `<p class="aide">Personne dans ce groupe pour l'instant.</p><button class="btn plat petit" data-act="suppG" data-sur data-g="${e(g)}">Supprimer ce groupe</button>`); }).join('') +
    (D.personnes.length || D.groupes.length ? '' : '<p class="vide">Ajoute les personnes dont tu veux suivre la liste de Noël, ou fais la tienne.</p>') +
    '<a class="btn" href="#/nouvelle">+ Ajouter une personne</a><a class="btn plat" href="#/groupe">+ Nouveau groupe</a>';
}

const ideesTriees = p => p.idees.map((x, k) => [x, k]).sort((a, b) => (b[0].favori - a[0].favori) || a[1] - b[1]).map(x => x[0]);   // coups de cœur d'abord
function carteIdee(p, i) {
  const magasin = Core.magasinIdee(i);
  return `<article class="carte idee s-${i.statut}">${cad(i.statut)}<div class="corps-idee"><div class="t">${i.favori ? '<span class="fav" role="img" aria-label="coup de cœur">★</span> ' : ''}${e(i.texte)}</div>` +
    `<div class="m">${p.moi ? '' : chip('s-' + i.statut, Core.LIBELLES[i.statut]) + ' '}${prixTxt(i)}${occHtml(i)}${magasin && !p.moi ? ` · <span class="magasin">${e(magasin)}</span>` : ''}${lienHtml(i)}</div>${i.note ? `<div class="m">${e(i.note)}</div>` : ''}</div>` +
    `<div class="actions">${!p.moi && ETAPE[i.statut] ? `<button class="btn petit" data-act="suivant" data-p="${p.id}" data-i="${i.id}">${ETAPE[i.statut]}</button>` : ''}` +
    `${p.moi ? `<button class="btn plat petit" data-act="fav" data-p="${p.id}" data-i="${i.id}" aria-pressed="${!!i.favori}">${i.favori ? '★ Coup de cœur' : '☆ Coup de cœur'}</button>` : ''}<a class="btn plat petit" href="#/p/${p.id}/idee/${i.id}">Modifier</a></div></article>`;
}
function aSavoir(pr, nom) {                                          // tailles, goûts, à éviter, « surprends-moi »
  if (!Core.profilRempli(pr)) return '';
  const li = (t, v) => (v ? `<dt>${t}</dt><dd>${e(v)}</dd>` : '');
  return `<div class="carte apropos"><b>À savoir sur ${e(nom)}</b>${pr.surprise ? ' <span class="surprends">🎁 Surprends-moi !</span>' : ''}<dl>${li('Tailles', pr.tailles)}${li('Goûts', pr.gouts)}${li('À éviter', pr.eviter)}${li('Commentaire', pr.commentaire)}</dl></div>`;
}

function vueFiche(p) {
  const auj = Core.aujourdhui(), due = Core.relances([p], auj, D.delai).length > 0, c = Core.compteurs([p]);
  const dates = p.demandeLe ? ` · demandée le ${Core.dateCourte(p.demandeLe)}${p.relanceLe ? `, relancée le ${Core.dateCourte(p.relanceLe)}` : ''}` : '';
  const bandeau = `<div class="proprio"><b>Liste de ${e(p.nom)}</b> : ce n'est pas ta liste, ${e(p.nom)} en est le propriétaire. ${p.partage ? `Reçue par lien le ${p.partage.maj ? Core.dateCourte(p.partage.maj) : '—'} : pour la mettre à jour, importe son nouveau lien.` : ''} Tes achats et ton budget restent privés.</div>`;
  return `${retour}<div class="entete-personne">${avatar(p.nom, true)}<div><h1>${e(p.nom)}</h1><p class="sous">${e(p.groupe)} · budget ${eurs(p.budget)} · <a href="#/p/${p.id}/modifier">Modifier</a></p></div>${!p.partage && c.choisis ? ring(c.achetes, c.choisis) : ''}</div>${bandeau}` +
    (p.partage ? '' :
    `<div class="carte">${chip('st-' + p.statut, libStatut(p, auj))}<span class="m">${e(dates)}</span>` +
    (p.statut === 'a_demander' ? `<a class="btn" href="#/p/${p.id}/demander">Demander sa liste</a>` : '') +
    (p.statut === 'demandee' ? `<a class="btn ${due ? '' : 'plat'}" href="#/p/${p.id}/demander">Relancer</a><button class="btn plat" data-act="recue" data-id="${p.id}">Marquer comme reçue</button>` : '') +
    `<a class="btn ${p.statut === 'demandee' && !due ? '' : 'plat'}" href="#/p/${p.id}/coller">Coller la réponse reçue</a></div>`) +
    bilanHtml(Core.bilan(p)) + (c.choisis ? barre(c.avancement) : '') + aSavoir(p.profil, p.nom) + `<h2>${plur(p.idees.length, 'idée')}</h2>${ideesTriees(p).map(i => carteIdee(p, i)).join('')}` +
    `<a class="btn plat" href="#/p/${p.id}/idee/nouvelle">+ Ajouter une idée</a>` +
    `<button class="btn danger" data-act="suppP" data-sur data-id="${p.id}">Supprimer cette personne</button>`;
}

// Ma liste : celle que j'écris et que j'envoie ; chez un proche qui a ouvert un lien de demande, c'est tout l'écran (mode « proche »).
function vueMaListe(p) {
  const dem = D.demande, de = dem && dem.de, proche = document.body.classList.contains('proche');
  const entete = dem ? hero(`Liste de Noël de ${e(p.nom)}`, `<p class="mot">${de ? e(de) + ' prépare Noël.' : 'Prépare ta liste.'}</p>${dem.limite ? `<p>À envoyer avant le ${Core.dateFr(dem.limite)}.</p>` : ''}`)
    : `${retour}<div class="entete-personne">${avatar(p.nom, true)}<div><h1>${e(p.nom)}</h1><p class="sous">Ma liste · <a href="#/p/${p.id}/modifier">Modifier</a></p></div></div>` +
      '<div class="proprio moi"><b>Ma liste</b> : tu en es le propriétaire. Tu peux la modifier et la partager ; les autres la voient en lecture seule.</div>';
  const rapide = '<form data-form="rapide" data-id="' + p.id + '" class="rapide"><label>Écris (ou dicte) tes idées, une par ligne<textarea name="texte" rows="3" required placeholder="Un livre de cuisine – 25€&#10;★ Des gants bleus (taille M)&#10;Un casque https://…"></textarea></label>' +
    '<button class="btn vert" type="submit">Ajouter ces idées</button></form><p class="aide">Prix : « 20€ ». ★ devant une idée = coup de cœur. Un lien collé est gardé. Tu pourras ensuite corriger chaque idée.</p>';
  const f = p.profil;
  const profilForm = `<details class="apropos-form" ${Core.profilRempli(f) ? '' : 'open'}><summary>À savoir sur moi (tailles, goûts, à éviter…)</summary><form data-form="profil" data-id="${p.id}">` +
    `<label>Tailles (vêtements, pointure, bague…)<input name="tailles" value="${e(f.tailles)}" autocomplete="off"></label><label>Goûts, centres d'intérêt<input name="gouts" value="${e(f.gouts)}" autocomplete="off"></label>` +
    `<label>À éviter, déjà possédé, allergies<input name="eviter" value="${e(f.eviter)}" autocomplete="off"></label><label class="coche"><input type="checkbox" name="surprise" ${f.surprise ? 'checked' : ''}>Surprends-moi (pas d'idée précise)</label>` +
    `<label>Un petit mot pour ${e(de || 'la personne')}<textarea name="commentaire" rows="2">${e(f.commentaire)}</textarea></label><button class="btn plat" type="submit">Enregistrer</button></form></details>`;
  const envoi = p.idees.length ? `<button class="btn envoi" data-act="partagerListe" data-id="${p.id}">${de ? (PEUT_ENVOYER ? `Envoyer ma liste à ${e(de)}…` : `Copier ma liste pour ${e(de)}`) : PEUT_ENVOYER ? 'Partager ma liste…' : 'Copier ma liste'}</button>` : '';
  return entete + rapide + `<h2>${plur(p.idees.length, 'idée')}</h2>${ideesTriees(p).map(i => carteIdee(p, i)).join('')}` +
    `<a class="btn plat" href="#/p/${p.id}/idee/nouvelle">+ Ajouter une idée détaillée (lien, magasin, note)</a>` + profilForm + envoi +
    (proche ? '<button class="btn plat petit" data-act="sortirProche">Utiliser l\'app complète</button>' : `<button class="btn danger" data-act="suppP" data-sur data-id="${p.id}">Supprimer ma liste</button>`);
}

function vueDemandeRecue(payload) {
  const dem = Core.decoderDemande(payload);
  if (!dem) return `${retour}<h1>Lien non valide</h1><p class="aide">Ce lien n'est pas une demande de liste : demande-le à nouveau à la personne.</p>`;
  D.demande = dem; sauver();                                          // on garde de qui vient la demande
  const moi = D.personnes.find(p => p.moi);
  return hero('Liste de Noël', `<p class="mot">${dem.de ? e(dem.de) + ' te demande' : 'On te demande'} ta liste !</p>${dem.limite ? `<p>À envoyer avant le ${Core.dateFr(dem.limite)}.</p>` : ''}`) +
    `<p class="aide">Écris tes idées avec leur prix, un lien et si l'occasion convient. Pas de compte : tout reste sur ton appareil jusqu'à ce que tu envoies ta liste${dem.de ? ' à ' + e(dem.de) : ''}.</p>` +
    (moi ? `<a class="btn" href="#/p/${moi.id}">Ouvrir ma liste</a>`
      : '<form data-form="commencer"><label>Ton prénom<input name="nom" required autocomplete="given-name"></label><button class="btn" type="submit">Commencer ma liste</button></form>');
}

// Partager l'app : le fichier Android (APK) et/ou le lien de l'app publiée (marche aussi sur iPhone).
function vuePartagerApp() {
  return `${retour}<h1>Partager l'app</h1><p class="aide">Pour que quelqu'un écrive sa liste directement dans l'app, envoie-lui l'app :</p>` +
    (A ? '<button class="btn" data-act="partagerApk">Envoyer l\'app (fichier Android)</button><p class="aide">Sur un téléphone Android : la personne ouvre le fichier reçu et autorise l\'installation si Android le demande. Ça ne marche pas sur iPhone.</p>' : '') +
    (D.site ? `<button class="btn ${A ? 'plat' : ''}" data-act="partagerLienApp">Envoyer le lien de l'app</button><p class="aide">Le lien ouvre l'app dans le navigateur (Android et iPhone) ; « Ajouter à l'écran d'accueil » la garde comme une app.</p>`
      : '<p class="alerte">Pour un lien qui marche aussi sur iPhone, il faut d\'abord publier le site : voir Réglages, « Adresse du site publié ».</p>');
}

function vueNouveauGroupe() {
  return `${retour}<h1>Nouveau groupe</h1><p class="aide">Un groupe range des personnes : famille, amis, collègues, la bande du sport…</p>` +
    '<form data-form="groupe"><label>Nom du groupe<input name="nom" required autocomplete="off"></label><button class="btn" type="submit">Créer le groupe</button><a class="btn plat" href="#/" data-act="retour">Annuler</a></form>';
}

// Écran de choix : comment ajouter quelqu'un ?
function vueNouvelle() {
  const choix = (href, titre, texte) => `<a class="carte choix" href="${href}"><b>${titre}</b><div class="m">${texte}</div></a>`;
  return `${retour}<h1>Ajouter une personne</h1>` +
    choix('#/nouvelle/main', 'Ajouter à la main', 'Tu écris son nom, puis ses idées (ou tu colles sa réponse).') +
    choix('#/nouvelle/lien', 'Envoyer un lien pour qu\'elle fasse sa liste', 'Elle écrit ses idées (liens, prix, occasion) directement dans l\'app et te les renvoie.') +
    choix('#/importer', 'Importer une liste partagée', 'Quelqu\'un t\'a envoyé le lien de sa liste : elle est rangée dans ton app, dans le groupe de ton choix.') +
    (D.personnes.some(p => p.moi) ? '' : choix('#/nouvelle/moi', 'Ma propre liste', 'Tes idées à toi, que tu partages aux autres : tu en es le propriétaire.')) +
    choix('#/partagerapp', 'Partager l\'app', 'Envoie l\'app à quelqu\'un pour qu\'il ou elle écrive sa liste directement dedans.');
}

// mode : 'main' (ajout manuel), 'lien' (envoi d'un lien pour qu'elle fasse sa liste), 'moi' (ma propre liste)
function vueFormPersonne(p, mode) {
  mode = p ? (p.moi ? 'moi' : 'main') : mode || 'main';
  p = p || { nom: '', groupe: 'Famille', budget: null, statut: mode === 'main' ? 'recue' : 'a_demander', demandeLe: null, profil: Core.profilVide() };
  const f = p.profil || Core.profilVide();
  const opt = (v, t) => `<option value="${v}" ${p.statut === v ? 'selected' : ''}>${t}</option>`;
  const titre = p.id ? 'Modifier' : { main: 'Nouvelle personne', lien: 'Envoyer un lien', moi: 'Ma propre liste' }[mode];
  return `${retour}<h1>${titre}</h1>` +
    `<form data-form="personne" data-id="${p.id || ''}" data-mode="${mode}"><label>${mode === 'moi' ? 'Ton prénom' : 'Prénom ou nom'}<input name="nom" required value="${e(p.nom)}" autocomplete="off"></label>` +
    (p.id && mode === 'main' && !p.partage ? '<label class="coche"><input type="checkbox" name="moi">C\'est ma propre liste (j\'en suis le propriétaire)</label>' : '') +
    (mode === 'moi' ? '' : champGroupe(p.groupe) +
    `<label>Budget en € (facultatif)<input name="budget" inputmode="decimal" placeholder="ex. 50" value="${p.budget ?? ''}"></label>`) +
    (mode === 'main' ? `<label>Demande de liste<select name="statut">${opt('a_demander', 'À demander')}${opt('demandee', 'Déjà demandée')}${opt('recue', 'Réponse reçue / liste écrite par moi')}</select></label>` +
    `<label>Date de la demande (si déjà demandée)<input type="date" name="demandeLe" value="${p.demandeLe || ''}"></label>` : '') +
    (mode === 'moi' ? '' : `<details class="apropos-form" ${Core.profilRempli(f) ? 'open' : ''}><summary>À savoir sur cette personne (tailles, goûts, à éviter…)</summary>` +
      `<label>Tailles<input name="tailles" value="${e(f.tailles)}" autocomplete="off"></label><label>Goûts, centres d'intérêt<input name="gouts" value="${e(f.gouts)}" autocomplete="off"></label>` +
      `<label>À éviter, déjà possédé, allergies<input name="eviter" value="${e(f.eviter)}" autocomplete="off"></label><label class="coche"><input type="checkbox" name="surprise" ${f.surprise ? 'checked' : ''}>Surprends-moi (pas d'idée précise)</label>` +
      `<label>Commentaire<textarea name="commentaire" rows="2">${e(f.commentaire)}</textarea></label></details>`) +
    `<button class="btn" type="submit">${mode === 'lien' ? 'Continuer : choisir comment envoyer' : 'Enregistrer'}</button><a class="btn plat" href="#/" data-act="retour">Annuler</a></form>`;
}

// Liste reçue par lien : on colle le lien, on relit, on range dans un groupe (ou on met à jour la liste déjà reçue).
function vueImporter() {
  if (importe) {
    const l = importe.liste, ex = importe.existant;
    return `${retour}<h1>${ex ? 'Mettre à jour' : 'Liste de'} ${e(l.nom || 'sans nom')}</h1><p class="aide">${plur(l.idees.length, 'idée')}. ${ex ? `Déjà dans ton app (groupe ${e(ex.groupe)}) : elle sera mise à jour, ton suivi est gardé.` : `Ce n'est pas ta liste : ${e(l.nom || 'cette personne')} en est le propriétaire.`}</p>` +
      aSavoir(l.profil, l.nom || 'cette personne') + l.idees.map(i => `<article class="carte idee s-idee"><div class="t">${i.favori ? '★ ' : ''}${e(i.texte)}</div><div class="m">${prixTxt({ prix: i.prix })}${occHtml(i)}${lienHtml(i)}</div></article>`).join('') +
      `<form data-form="importe">${ex ? '' : champGroupe('Famille')}` +
      `<button class="btn" type="submit">${ex ? 'Mettre à jour' : 'Ajouter à mon app'}</button><button class="btn plat" type="button" data-act="importerAnnuler">Annuler</button></form>`;
  }
  return `${retour}<h1>Importer une liste partagée</h1><p class="aide">Copie le lien reçu (liste ou demande, par WhatsApp, message…), puis appuie sur « Coller le lien copié ». Tu peux aussi le coller dans le champ.</p>` +
    '<button class="btn" data-act="importerColler">Coller le lien copié</button>' +
    '<textarea id="lienImport" rows="3" placeholder="https://…/liste.html#…"></textarea><button class="btn plat" data-act="importerLire">Lire ce lien</button>';
}

function vueFormIdee(p, i) {
  i = i || { texte: '', prix: null, url: '', statut: 'idee', prixReel: null, occasion: null, favori: false, magasin: '', note: '' };
  const opt = s => `<option value="${s}" ${i.statut === s ? 'selected' : ''}>${Core.LIBELLES[s]}</option>`;
  return `${retour}<h1>${i.id ? "Modifier l'idée" : 'Nouvelle idée'}</h1><p class="sous">pour ${e(p.nom)}</p>` +
    `<form data-form="idee" data-p="${p.id}" data-i="${i.id || ''}"><label>Idée<input name="texte" required value="${e(i.texte)}" autocomplete="off"></label>` +
    `<label>Prix estimé en €<input name="prix" inputmode="decimal" value="${i.prix ?? ''}"></label>` +
    `<label>Lien (facultatif)<input name="url" type="url" inputmode="url" placeholder="Toucher pour coller ou chercher…" data-choix="lien" ${i.url ? '' : 'readonly'} value="${e(i.url || '')}"></label>` +
    `<label>D'occasion possible ?<select name="occasion">${[['', 'Je ne sais pas'], ['oui', "Oui, l'occasion convient"], ['non', 'Non, neuf seulement']].map(([v, t]) => `<option value="${v}" ${(i.occasion || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` +
    `<label class="coche"><input type="checkbox" name="favori" ${i.favori ? 'checked' : ''}>★ Coup de cœur (à passer en premier)</label>` +
    (p.moi ? '' : `<label>Magasin (facultatif : sinon déduit du lien)<input name="magasin" value="${e(i.magasin || '')}" placeholder="ex. Fnac" autocomplete="off"></label>`) +
    (p.moi ? '' : `<label>Statut<select name="statut">${Core.STATUTS.map(opt).join('')}</select></label>` +
    `<label>Prix réel payé en €<input name="prixReel" inputmode="decimal" value="${i.prixReel ?? ''}"></label>`) +
    `<label>${p.moi ? 'Taille, couleur, modèle…' : 'Note'}<textarea name="note" rows="3">${e(i.note)}</textarea></label>` +
    `<button class="btn" type="submit">Enregistrer</button><a class="btn plat" href="#/" data-act="retour">Annuler</a></form>` +
    (i.id ? `<button class="btn danger" data-act="suppI" data-sur data-p="${p.id}" data-i="${i.id}">Supprimer cette idée</button>` : '');
}

function vueDemande(p) {
  const relance = p.statut === 'demandee';
  return `${retour}<h1>${relance ? 'Relancer' : 'Demander sa liste à'} ${e(p.nom)}</h1>` +
    `<p class="aide">${PEUT_ENVOYER ? 'Appuie sur « Envoyer » puis choisis WhatsApp, SMS ou mail.' : 'Copie le message, puis colle-le dans WhatsApp, Messages ou ton mail.'} Tu peux modifier le texte d'abord ; la personne passera en « ${relance ? 'relancée' : 'demandée'} ».</p>` +
    (D.limite < Core.aujourdhui() ? '<p class="alerte">La date limite des réglages est dépassée : change-la dans Réglages.</p>' : '') +
    (D.site ? '' : '<p class="aide">Aucun site publié n\'est réglé (Réglages) : le message part sans lien vers l\'app.</p>') +
    `<textarea id="msg" rows="13">${e(Core.message(relance ? D.relance : D.modele, p.nom, D.limite) + (D.site ? `\n\nPour écrire ta liste directement dans l'app (idées, liens, prix, occasion ou non) : ${Core.lienDemande(D.site, demandeur(), D.limite)}` : ''))}</textarea>` +
    `<button class="btn" data-act="envoyer" data-id="${p.id}">${PEUT_ENVOYER ? 'Envoyer…' : 'Copier le message'}</button>` +
    (PEUT_ENVOYER ? '<button class="btn plat" data-act="copierMsg">Copier seulement</button>' : '');
}

function vueColler(p) {
  if (collage && collage.id === p.id) {
    const rangs = collage.idees.map((i, k) => `<div class="rang ${i.ignore ? 'ignore' : ''}"><label><input type="checkbox" name="k${k}" ${i.ignore ? '' : 'checked'} aria-label="Garder"></label>` +
      `<div class="champs"><input name="t${k}" value="${e(i.texte)}" aria-label="Idée"><input name="p${k}" inputmode="decimal" placeholder="Prix en €" value="${i.prix ?? ''}" aria-label="Prix">` +
      `${i.url ? `<small class="url">${e(i.url)}</small>` : ''}${i.occasion ? `<small class="url">${Core.libOcc(i.occasion)}</small>` : ''}${i.favori ? '<small class="url">★ coup de cœur</small>' : ''}</div></div>`).join('');
    const pr = collage.profil, infos = Core.profilRempli(pr) ? `<div class="carte apropos"><label class="coche"><input type="checkbox" name="profil" checked>Ajouter à sa fiche : ${[pr.tailles && 'tailles ' + pr.tailles, pr.gouts && 'goûts ' + pr.gouts, pr.eviter && 'à éviter ' + pr.eviter, pr.surprise && 'surprends-moi', pr.commentaire && 'un petit mot'].filter(Boolean).map(e).join(' · ')}</label></div>` : '';
    return `${retour}<h1>Vérifie les idées</h1><p class="aide">Corrige le texte ou le prix, décoche ce que tu ne veux pas garder (les bonjours et titres sont déjà décochés).</p>` +
      `<form data-form="collage" data-id="${p.id}">${infos}${rangs}<button class="btn" type="submit">Ajouter les idées</button>` +
      '<button class="btn plat" type="button" data-act="recommencer">Recommencer</button></form>';
  }
  return `${retour}<h1>Réponse de ${e(p.nom)}</h1><p class="aide">Colle ici le message reçu. Une idée par ligne : les puces, les numéros, les prix (« 20€ ») et les liens sont reconnus.</p>` +
    '<textarea id="rep" rows="10" placeholder="- Un livre sur la montagne – 20€&#10;- Des chaussettes de rando&#10;- Un casque https://…"></textarea>' +
    `<button class="btn" data-act="decouper" data-id="${p.id}">Découper en idées</button>`;
}

let modeAchat = 'personne';                                           // « À acheter » : classé par personne ou par magasin
function vueAcheter() {
  const autres = D.personnes.filter(p => !p.moi), gs = Core.aAcheter(autres), total = Math.round(gs.reduce((s, g) => s + g.total, 0) * 100) / 100;
  if (!gs.length) return '<h1>À acheter</h1><p class="vide">Rien à acheter pour l\'instant.<br>Passe des idées en « Choisi » depuis la fiche d\'une personne.</p>';
  const bouton = (m, t) => `<button type="button" class="${modeAchat === m ? 'on' : ''}" aria-pressed="${modeAchat === m}" data-act="modeAchat" data-m="${m}">${t}</button>`;
  const ligne = (i, p, avec) => `<div class="achat"><div><b>${e(i.texte)}</b>${avec ? ` <span class="m">pour ${e(p.nom)}</span>` : ''}<div class="m">${prixTxt(i)}${occHtml(i)}${lienHtml(i)}</div></div>` +
    `<button class="btn petit" data-act="suivant" data-p="${p.id}" data-i="${i.id}">Acheté</button></div>`;
  const corps = modeAchat === 'magasin'
    ? Core.aAcheterParMagasin(autres).map(g => `<section class="carte"><h2>${e(g.magasin || 'Sans magasin')}<small>${eurs(g.total)}</small></h2>${g.idees.map(x => ligne(x.idee, x.personne, true)).join('')}</section>`).join('')
    : gs.map(g => `<section class="carte"><h2><a href="#/p/${g.personne.id}">${e(g.personne.nom)}</a><small>${eurs(g.total)}</small></h2>${g.idees.map(i => ligne(i, g.personne, false)).join('')}</section>`).join('');
  return `<h1>À acheter</h1><p class="sous">${(n => `${n} cadeau${n > 1 ? 'x' : ''}`)(gs.reduce((s, g) => s + g.idees.length, 0))} à acheter, environ ${eurs(total)}</p>` +
    `<div class="basculer" role="group" aria-label="Classer">${bouton('personne', 'Par personne')}${bouton('magasin', 'Par magasin')}</div>` + corps +
    '<button class="btn plat" data-act="copierCourses">Copier la liste de courses</button>';
}

function vueReglages() {
  return `<h1>Réglages</h1><form data-form="reglages">` +
    `<label>Date limite de réponse (écrite dans les messages)<input type="date" name="limite" required value="${D.limite}"></label>` +
    `<label>Relancer après (jours sans réponse)<input type="number" name="delai" min="1" max="60" inputmode="numeric" required value="${D.delai}"></label>` +
    `<label>Message de demande<textarea name="modele" rows="9">${e(D.modele)}</textarea></label>` +
    `<label>Message de relance<textarea name="relance" rows="6">${e(D.relance)}</textarea></label>` +
    '<p class="aide">{prenom} et {date} sont remplacés dans le message.</p>' +
    `<label>Ton prénom (écrit dans les demandes que tu envoies)<input name="prenom" value="${e(D.prenom)}" autocomplete="given-name"></label>` +
    `<label>Adresse du site publié (dossier web/ : l'app et liste.html)<input name="site" type="url" inputmode="url" placeholder="https://…/" value="${e(D.site)}"></label>` +
    '<p class="aide">Laisse vide tant que le site n\'est pas publié : les messages et le partage partent alors sans lien.</p>' +
    '<button class="btn" type="submit">Enregistrer</button>' +
    '<button class="btn plat" type="button" data-act="modelesDefaut" data-sur>Rétablir les messages d\'origine</button></form>' +
    '<h2>Sauvegarde</h2><p class="aide">Les données restent sur cet appareil. Pour les passer du téléphone au Mac (ou l\'inverse) : envoie-toi la sauvegarde, puis colle-la plus bas sur l\'autre appareil.</p>' +
    `<textarea id="export" rows="4" readonly>${e(Core.exporter(D))}</textarea>` +
    (A ? '<button class="btn" data-act="partagerExport">Partager la sauvegarde…</button>' : '<button class="btn" data-act="telechargerExport">Télécharger le fichier</button>') +
    '<button class="btn plat" data-act="copierExport">Copier la sauvegarde</button>' +
    '<h2>Restaurer</h2><textarea id="import" rows="4" placeholder="Colle ici une sauvegarde"></textarea>' +
    (A ? '' : '<label>…ou choisis un fichier<input type="file" id="fichier" accept=".json,application/json"></label>') +
    '<button class="btn danger" data-act="importer" data-sur>Remplacer mes données par cette sauvegarde</button>';
}

// ---------- affichage et routage ----------
function nav(actif) {
  const n = Core.aAcheter(D.personnes.filter(p => !p.moi)).reduce((s, g) => s + g.idees.length, 0);
  const lien = (cle, href, ico, t) => `<a href="${href}" class="${actif === cle ? 'on' : ''}"><span aria-hidden="true">${ico}</span><i>${t}</i></a>`;
  return lien('home', '#/', '🎁', 'Personnes') + lien('acheter', '#/acheter', '🛒', `À acheter${n ? ` <b>${n}</b>` : ''}`) + lien('reglages', '#/reglages', '⚙️', 'Réglages');
}

function render() {
  const [a, id, sub, sid] = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent);
  const p = a === 'p' ? personne(id) : null;
  if (a === 'p' && !p) { location.replace('#/'); return; }
  const moiP = D.personnes.find(x => x.moi), seule = !D.personnes.some(x => !x.moi);
  const proche = !!(a === 'demande' || (D.demande && moiP)) && seule;       // un proche qui a ouvert un lien de demande : une seule page, sans onglets
  document.body.classList.toggle('proche', proche);
  if (proche && !a && moiP) { location.replace('#/p/' + moiP.id); return; }
  if (!(a === 'p' && sub === 'coller')) collage = null;
  if (a !== 'importer') importe = null;
  let html, actif = 'home';
  if (a === 'nouvelle') html = id ? vueFormPersonne(null, id) : vueNouvelle();
  else if (a === 'importer') html = vueImporter();
  else if (a === 'groupe') html = vueNouveauGroupe();
  else if (a === 'demande') html = vueDemandeRecue(id);
  else if (a === 'partagerapp') html = vuePartagerApp();
  else if (a === 'acheter') { html = vueAcheter(); actif = 'acheter'; }
  else if (a === 'reglages') { html = vueReglages(); actif = 'reglages'; }
  else if (p && sub === 'modifier') html = vueFormPersonne(p);
  else if (p && sub === 'demander') html = vueDemande(p);
  else if (p && sub === 'coller') html = vueColler(p);
  else if (p && sub === 'idee') html = vueFormIdee(p, p.idees.find(i => i.id === sid));
  else if (p) html = p.moi ? vueMaListe(p) : vueFiche(p);
  else html = vueAccueil();
  $('#app').innerHTML = html;
  $('#nav').innerHTML = nav(actif);
  decorer();
  if (location.hash !== derniere) { window.scrollTo(0, 0); derniere = location.hash; }   // pas de saut en haut quand on coche des achats
}

// ---------- champ Lien : coller un lien ou chercher dans un navigateur ----------
const champLien = () => $('form[data-form=idee] [name=url]');
const lirePresse = () => (A ? Promise.resolve(A.presse()) : navigator.clipboard ? navigator.clipboard.readText() : Promise.reject()).catch(() => '');
function fermerFeuille() { $('#feuille')?.remove(); }
function ouvrirFeuille() {
  if ($('#feuille')) return;
  document.body.insertAdjacentHTML('beforeend', '<div id="feuille" data-act="lienFermer"><div class="carte" role="dialog" aria-label="Ajouter un lien" data-act="rien"><b>Ajouter un lien</b>' +
    '<button class="btn" data-act="lienColler">Coller un lien</button><button class="btn plat" data-act="lienWeb">Ouvrir le navigateur</button>' +
    '<button class="btn plat" data-act="lienFermer">Annuler</button></div></div>');
}
// Retour du petit navigateur Android (« C'est la bonne page ») : on remplit le lien, et le titre de l'idée s'il est vide.
window.lienChoisi = (url, titre) => {
  const f = $('form[data-form=idee]'); if (!f) return;
  f.url.readOnly = false; f.url.value = url; if (!f.texte.value.trim() && titre) f.texte.value = String(titre).trim().slice(0, 80);
  toast('Lien ajouté');
};
document.addEventListener('click', ev => {
  const c = ev.target.closest('input[data-choix=lien]');
  if (c && c.readOnly) ouvrirFeuille();                               // champ vide (lecture seule, pas de clavier) : on propose coller ou chercher ; rempli : on l'édite normalement
});

// Un lien de liste partagée (…/liste.html#données) : on lit les données, on repère une liste déjà reçue (même identifiant).
function lireLienListe(t) {
  const dem = /#\/demande\/([\w-]+)/.exec(String(t || ''));
  if (dem) { location.hash = '#/demande/' + dem[1]; return; }          // le lien est une demande de liste, pas une liste
  const frag = (/liste\.html#([\w-]+)/.exec(String(t || '')) || /#([\w-]{20,})/.exec(String(t || '')) || [])[1];   // le lien peut être au milieu d'un message entier collé
  const liste = Core.decoderListe(frag || String(t || '').trim().split('#').pop());
  if (!liste) return toast("Ce texte n'est pas le lien d'une liste partagée.");
  importe = { liste, existant: liste.id ? D.personnes.find(p => p.partage && p.partage.id === liste.id) : null };
  render();
}

// ---------- actions (boutons) ----------
const actions = {
  retour() { history.length > 1 ? history.back() : (location.hash = '#/'); },
  suivant(d) {
    const i = personne(d.p).idees.find(x => x.id === d.i);
    i.statut = Core.suivant(i.statut) || i.statut; sauver(); render();
  },
  recue(d) { personne(d.id).statut = 'recue'; sauver(); render(); },
  suppP(d) { D.personnes = D.personnes.filter(p => p.id !== d.id); sauver(); location.replace('#/'); toast('Personne supprimée'); },
  suppI(d) { const p = personne(d.p); p.idees = p.idees.filter(i => i.id !== d.i); sauver(); location.replace('#/p/' + d.p); toast('Idée supprimée'); },
  envoyer(d) {
    const p = personne(d.id), texte = $('#msg').value, auj = Core.aujourdhui();
    partager(texte, 'Ta liste de Noël ?');
    if (p.statut === 'demandee') p.relanceLe = auj; else { p.statut = 'demandee'; p.demandeLe = auj; p.relanceLe = null; }
    sauver(); location.replace('#/p/' + p.id);
  },
  partagerListe(d) {
    const p = personne(d.id), lien = D.site ? Core.lienListe(D.site + 'liste.html', p.nom, p.idees, p.id, p.profil) : '';
    const texte = (lien ? `Ma liste de Noël à regarder ici : ${lien}\n\n` : '') + Core.texteListe(p.idees, p.profil);
    partager(texte, 'Ma liste de Noël');
  },
  fav(d) { const i = personne(d.p).idees.find(x => x.id === d.i); i.favori = !i.favori; sauver(); render(); },
  modeAchat(d) { modeAchat = d.m; render(); },
  copierCourses() { copier(Core.texteCourses(Core.aAcheterParMagasin(D.personnes.filter(p => !p.moi)))).then(() => toast('Liste de courses copiée')); },
  sortirProche() { D.demande = null; sauver(); location.hash = '#/'; render(); },
  suppG(d) { D.groupes = D.groupes.filter(g => g !== d.g); sauver(); render(); toast('Groupe supprimé'); },
  partagerApk() { A.partagerApp(); },
  partagerLienApp() { partager(`Installe Listes de Noël pour écrire ta liste de Noël : ${D.site}\n(Sur iPhone : Partager, puis « Sur l'écran d'accueil ». Sur Android : menu ⋮, puis « Ajouter à l'écran d'accueil ».)`, 'Listes de Noël'); },
  lienColler() {
    fermerFeuille();
    lirePresse().then(t => {
      const u = Core.lien(t), c = champLien();
      if (c) c.readOnly = false;
      if (u && c) { c.value = u; toast('Lien collé'); } else { if (c) c.focus(); toast('Aucun lien copié : écris-le ou colle-le dans le champ.'); }
    });
  },
  lienWeb() {
    fermerFeuille();
    const q = ($('form[data-form=idee]')?.texte.value || '').trim();
    if (A) return A.ouvrirNavigateur(q);                              // petit navigateur de l'app : « C'est la bonne page » renvoie l'adresse
    window.open(q ? 'https://www.google.com/search?q=' + encodeURIComponent(q) : 'https://www.google.com/', '_blank', 'noopener');   // shortcut : sur Mac, pas de retour automatique
    toast("Copie l'adresse de la page, reviens ici et appuie sur « Coller un lien ».");
  },
  lienFermer() { fermerFeuille(); },
  importerColler() { lirePresse().then(t => lireLienListe(t)); },
  importerLire() { lireLienListe($('#lienImport').value); },
  importerAnnuler() { importe = null; render(); },
  rien() {},
  copierMsg() { copier($('#msg').value).then(() => toast('Message copié')); },
  decouper(d) {
    const idees = Core.decouper($('#rep').value);
    if (!idees.length) return toast('Aucune idée trouvée : colle le message reçu.');
    collage = { id: d.id, idees, profil: Core.profilDepuis($('#rep').value) }; render();
  },
  recommencer() { collage = null; render(); },
  modelesDefaut() { const f = $('form'); f.modele.value = Core.MODELE; f.relance.value = Core.RELANCE; toast('Messages d\'origine remis : appuie sur Enregistrer.'); },
  partagerExport() { A.partager(Core.exporter(D), 'Sauvegarde Listes de Noël'); },
  copierExport() { copier(Core.exporter(D)).then(() => toast('Sauvegarde copiée')); },
  telechargerExport() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Core.exporter(D)], { type: 'application/json' }));
    a.download = `listes-noel-${Core.aujourdhui()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  importer() {
    const r = Core.importer($('#import').value);
    if (r.erreur) return toast(r.erreur);
    try { localStorage.setItem(CLE + '.avant-import', JSON.stringify(D)); } catch (e2) { /* tant pis */ }
    D = r.donnees; sauver(); location.hash = '#/'; render(); toast(`Sauvegarde restaurée : ${plur(D.personnes.length, 'personne')}`);
  },
};

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  if ('sur' in b.dataset && !b.classList.contains('arme')) {          // suppression : un premier appui arme le bouton, le second confirme
    ev.preventDefault(); b.dataset.txt = b.textContent; b.textContent = 'Appuie encore pour confirmer'; b.classList.add('arme');
    setTimeout(() => { if (b.isConnected) { b.textContent = b.dataset.txt; b.classList.remove('arme'); } }, 3000);
    return;
  }
  if (b.tagName === 'A') ev.preventDefault();
  actions[b.dataset.act](b.dataset);
});

// ---------- formulaires ----------
const formulaires = {
  personne(f, d) {
    const auj = Core.aujourdhui(), mode = d.mode;
    const p = d.id ? personne(d.id) : { id: Core.nouvelId(), idees: [], relanceLe: null, moi: false, partage: null, profil: Core.profilVide() };
    if (mode === 'moi' || f.has('moi')) Object.assign(p, { nom: f.get('nom').trim(), moi: true, groupe: 'Ma liste', budget: null, statut: 'recue', demandeLe: null, relanceLe: null });
    else {
      const statut = f.get('statut') || p.statut || 'a_demander', date = Core.iso(f.get('demandeLe')) || p.demandeLe || null;
      Object.assign(p, { nom: f.get('nom').trim(), groupe: groupeChoisi(f), budget: Core.nombre(f.get('budget')), statut,
        demandeLe: statut === 'a_demander' ? null : statut === 'demandee' ? date || auj : date });     // liste écrite ou reçue sans demande : pas de date inventée
      if (statut === 'a_demander') p.relanceLe = null;
    }
    if (f.has('nom') && mode !== 'moi' && !f.has('moi')) p.profil = Core.profilNet({ tailles: f.get('tailles'), gouts: f.get('gouts'), eviter: f.get('eviter'), surprise: f.has('surprise'), commentaire: f.get('commentaire') });
    if (!p.profil) p.profil = Core.profilVide();
    if (!d.id) D.personnes.push(p);
    sauver(); location.replace('#/p/' + p.id + (mode === 'lien' ? '/demander' : ''));       // « lien » : on enchaîne sur le message à envoyer
  },
  groupe(f) {
    const nom = f.get('nom').trim().slice(0, 40);
    if (nom && !D.groupes.includes(nom)) D.groupes.push(nom);
    sauver(); location.replace('#/'); toast(`Groupe « ${nom} » créé`);
  },
  commencer(f) {                                                      // première liste, ouverte par un lien de demande
    const p = { id: Core.nouvelId(), nom: f.get('nom').trim(), moi: true, groupe: 'Ma liste', budget: null, statut: 'recue', demandeLe: null, relanceLe: null, partage: null, profil: Core.profilVide(), idees: [] };
    D.personnes.push(p); sauver(); location.replace('#/p/' + p.id);
  },
  importe(f) {
    const { liste, existant } = importe, auj = Core.aujourdhui();
    let p = existant;
    if (p) { p.idees = Core.fusionner(p, liste); p.nom = liste.nom || p.nom; p.partage.maj = auj; if (liste.profil) p.profil = liste.profil; }
    else {
      p = { id: Core.nouvelId(), nom: liste.nom || 'Sans nom', moi: false, groupe: groupeChoisi(f), budget: null, statut: 'recue', demandeLe: null, relanceLe: null,
        partage: { id: liste.id || Core.nouvelId(), maj: auj }, profil: liste.profil || Core.profilVide(), idees: Core.fusionner({ idees: [] }, liste) };
      D.personnes.push(p);
    }
    importe = null; sauver(); location.replace('#/p/' + p.id); toast(existant ? 'Liste mise à jour' : 'Liste ajoutée à ton app');
  },
  idee(f, d) {
    const p = personne(d.p), i = d.i ? p.idees.find(x => x.id === d.i) : { id: Core.nouvelId() };
    const url = f.get('url').trim();
    Object.assign(i, { texte: f.get('texte').trim(), prix: Core.nombre(f.get('prix')), url: /^https?:\/\//i.test(url) ? url : null,
      statut: f.get('statut') || i.statut || 'idee', prixReel: f.has('prixReel') ? Core.nombre(f.get('prixReel')) : i.prixReel ?? null, occasion: f.get('occasion') || null, favori: f.has('favori'), magasin: String(f.get('magasin') || '').trim().slice(0, 40), note: f.get('note').trim() });
    if (!d.i) p.idees.push(i);
    sauver(); location.replace('#/p/' + p.id);
  },
  collage(f, d) {
    const p = personne(d.id);
    const neuves = collage.idees.map((i, k) => ({ id: Core.nouvelId(), texte: String(f.get('t' + k)).trim(), prix: Core.nombre(f.get('p' + k)), url: i.url,
      statut: 'idee', prixReel: null, occasion: i.occasion, favori: !!i.favori, magasin: '', note: '', garde: f.get('k' + k) })).filter(i => i.garde && i.texte);
    if (f.has('profil') && collage.profil) p.profil = fusionProfil(p.profil, collage.profil);
    if (!neuves.length && !f.has('profil')) return toast('Aucune idée cochée.');
    neuves.forEach(i => { delete i.garde; p.idees.push(i); });
    if (p.statut !== 'recue') p.statut = 'recue';
    collage = null; sauver(); location.replace('#/p/' + p.id); toast(`${plur(neuves.length, 'idée')} ajoutée${neuves.length > 1 ? 's' : ''}`);
  },
  profil(f, d) {
    personne(d.id).profil = Core.profilNet({ tailles: f.get('tailles'), gouts: f.get('gouts'), eviter: f.get('eviter'), surprise: f.has('surprise'), commentaire: f.get('commentaire') });
    sauver(); render(); toast('Enregistré');
  },
  rapide(f, d) {                                                      // plusieurs idées d'un coup : une par ligne (même découpage que « Coller la réponse »)
    const p = personne(d.id), texte = f.get('texte'), neuves = Core.decouper(texte).filter(i => !i.ignore);
    if (!neuves.length) return toast('Aucune idée trouvée : écris une idée par ligne.');
    neuves.forEach(i => p.idees.push({ id: Core.nouvelId(), texte: i.texte, prix: i.prix, url: i.url, statut: 'idee', prixReel: null, occasion: i.occasion, favori: !!i.favori, magasin: '', note: '' }));
    const pr = Core.profilDepuis(texte); if (Core.profilRempli(pr)) p.profil = fusionProfil(p.profil, pr);
    sauver(); render(); toast(`${plur(neuves.length, 'idée')} ajoutée${neuves.length > 1 ? 's' : ''}`);
  },
  reglages(f) {
    D = Core.normaliser({ ...D, limite: f.get('limite'), delai: f.get('delai'), modele: f.get('modele'), relance: f.get('relance'), site: f.get('site'), prenom: f.get('prenom') });
    sauver(); render(); toast('Réglages enregistrés');
  },
};
document.addEventListener('submit', ev => { ev.preventDefault(); formulaires[ev.target.dataset.form](new FormData(ev.target), ev.target.dataset); });
document.addEventListener('change', ev => {
  if (ev.target.name === 'groupe' && ev.target.tagName === 'SELECT') {        // « + Nouveau groupe… » : on montre le champ du nom
    const n = ev.target.form.querySelector('.nouveau'), nouveau = ev.target.value === '__nouveau';
    n.hidden = !nouveau; n.querySelector('input').required = nouveau; if (nouveau) n.querySelector('input').focus();
  }
  if (ev.target.id === 'fichier' && ev.target.files[0]) ev.target.files[0].text().then(t => { $('#import').value = t; toast('Fichier lu : appuie sur « Remplacer »'); });
});

window.addEventListener('hashchange', render);
// Clavier ouvert = fenêtre plus basse à largeur égale (adjustResize) : on masque la barre d'onglets (voir style.css).
let larg = innerWidth, haut = innerHeight;
window.addEventListener('resize', () => {
  if (innerWidth !== larg) { larg = innerWidth; haut = innerHeight; } else haut = Math.max(haut, innerHeight);   // rotation : nouvelle référence
  document.body.classList.toggle('clavier', innerHeight < haut * 0.75);
});
charger();
render();
