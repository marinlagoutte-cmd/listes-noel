// Logique pure de « Listes de Noël » : découpage des réponses, budgets, relances, messages, import/export.
// Aucune dépendance au navigateur : testée par test/core.test.js (node) et chargée telle quelle par index.html.
const Core = (() => {
  const STATUTS = ['idee', 'choisi', 'achete', 'emballe', 'offert'];
  const STATUTS_PERSONNE = ['a_demander', 'demandee', 'recue'];
  const LIBELLES = { idee: 'Idée', choisi: 'Choisi', achete: 'Acheté', emballe: 'Emballé', offert: 'Offert' };

  const MODELE_V1 = "Coucou {prenom} ! 🎄\n\nNoël approche et j'aimerais vraiment te faire plaisir. Peux-tu m'envoyer ta liste de Noël ? Quelques idées suffisent, une par ligne, avec un budget ou un lien si tu en as.\n\nSi tu peux me répondre avant le {date}, ce serait top. Merci beaucoup !\n\nBisous,\nMarin";   // ancien modèle : remplacé par MODELE s'il n'a pas été modifié
  const MODELE = "Coucou {prenom} ! 🎄\n\nNoël approche et j'aimerais vraiment te faire plaisir. Peux-tu m'envoyer ta liste de Noël ? Quelques idées suffisent, une par ligne, avec un lien et un prix si tu en as, et si l'occasion te convient (ou non).\n\nSi tu peux me répondre avant le {date}, ce serait top. Merci beaucoup !\n\nBisous,\nMarin";
  const RELANCE = "Coucou {prenom} ! Petit rappel pour ta liste de Noël 🎁 : je vais bientôt faire mes achats, tu aurais un moment pour m'envoyer tes idées avant le {date} ? Une idée par ligne, c'est parfait. Merci !\n\nMarin";

  // ---------- dates (chaînes « AAAA-MM-JJ », calculs en UTC pour échapper à l'heure d'été) ----------
  const pad = n => String(n).padStart(2, '0');
  const aujourdhui = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const utc = s => { const [y, m, j] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, j); };
  const iso = s => { try { return new Date(utc(s)).toISOString().slice(0, 10) === s ? s : ''; } catch (e) { return ''; } };
  const joursEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
  const ajouterJours = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
  const dateFr = s => new Date(utc(s)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const dateCourte = s => new Date(utc(s)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  function joursAvantNoel(auj) {
    const y = +auj.slice(0, 4);
    return joursEntre(auj, auj > `${y}-12-25` ? `${y + 1}-12-25` : `${y}-12-25`);
  }

  // ---------- nombres et argent ----------
  const r2 = x => Math.round(x * 100) / 100;
  // ---------- profil d'une personne : tailles, goûts, à éviter, « surprends-moi », commentaire ----------
  const profilVide = () => ({ tailles: '', gouts: '', eviter: '', surprise: false, commentaire: '' });
  const court = (x, n = 300) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
  const profilNet = x => { x = x && typeof x === 'object' ? x : {}; return { tailles: court(x.tailles), gouts: court(x.gouts), eviter: court(x.eviter), surprise: x.surprise === true, commentaire: court(x.commentaire) }; };
  const profilRempli = p => !!(p && (p.tailles || p.gouts || p.eviter || p.surprise || p.commentaire));
  const nombre = v => {
    if (v == null) return null;
    const s = String(v).replace(/[€\s  ]/g, '').replace(',', '.');
    const n = s === '' ? NaN : Number(s);
    return Number.isFinite(n) && n >= 0 ? r2(n) : null;
  };
  const eur = x => x.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // ---------- découpage d'une réponse collée ----------
  const NUM = '(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?';
  // Prix : « 20€ », « 20 euros », « €20 », « 12€50 », « environ 20 € », « (20€) », « entre 20 et 30 € » (prend le haut de la fourchette).
  const RE_PRIX = new RegExp(
    '(?<![\\p{L}\\p{N}])(?:[(\\[]\\s*)?' +
    "(?:(?:entre|environ|env\\.?|autour de|vers|~|≈|à|max(?:imum|i)?|moins de|jusqu'à)\\s*)?" +
    `(?:${NUM}\\s*(?:€|euros?)?\\s*(?:-|–|—|à|et|ou|/)\\s*)?` +
    `(?:€\\s*(?<p1>${NUM})|(?<p2>${NUM})\\s*(?:€|euros?\\b|eur\\b)(?<c>\\d{2}(?!\\d))?)` +
    '(?:\\s*(?:max(?:imum|i)?|environ|env\\.?|ttc|pièce))?(?:\\s*[)\\]])?', 'iu');
  const RE_LIEN = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;
  // « d'occasion possible oui / non » : « d'occasion », « occasion ok », « seconde main », « reconditionné » = oui ; « pas d'occasion », « neuf uniquement » = non.
  const OK = "(?:ok|oui|possible|accept\\p{L}*|autoris\\p{L}*)";
  const RE_OCC_NON = /\bpas\s+d['’]?\s*occasion|\boccasion\s+(?:non|impossible|refus\p{L}*)|\b(?:que|uniquement|seulement|obligatoirement)\s+(?:du\s+)?neuf|\bneuf\s+(?:uniquement|seulement|obligatoire|exclusivement)/iu;
  const RE_OCC_OUI = new RegExp(`\\bd['’]\\s*occasion(?:\\s+${OK})?|\\boccasion\\s+${OK}|\\bseconde\\s+main|\\breconditionn\\p{L}*`, 'iu');
  const retirer = (t, m) => t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  // Premier lien http(s) d'un texte (ou null) ; « www.… » devient « https://www.… ».
  const lien = t => { const m = String(t || '').match(RE_LIEN); if (!m) return null; const l = m[0].replace(/[.,;:!?)»\]]+$/, ''); return /^www\./i.test(l) ? 'https://' + l : l; };
  // « [24/11/2026 14:32:10] Maman : » ou « 24/11/2026 14:32 - Maman : » (copie depuis WhatsApp)
  const RE_WHATSAPP = /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4}[,\s]+\d{1,2}[:h]\d{2}(?::\d{2})?\]?\s*[-–]?\s*[^:]{1,40}:\s*/;
  const RE_SALUT = /^(salut|coucou|bonjour|bonsoir|hello|hey|cher|chere|merci|bises?|bisous|gros bisous|a (tres )?bientot|cordialement|bonne (journee|soiree|fin)|voila|voici|j'espere|joyeux|ps|ma liste|mes idees|ta liste|la liste|liste)\b/;
  const sansAccent = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const RE_FINALE = /^(bises?|bisous|gros bisous|a (tres )?bientot|bien a toi|bien a vous|cordialement|amicalement|affectueusement|je t'embrasse|a tres vite)\b/;   // fin du message : ce qui suit est une signature

  // « Tailles : M, 42 », « À éviter : parfums », « Surprends-moi : oui »… : des informations sur la personne, pas des idées.
  const CLES_PROFIL = [['tailles', /^(tailles?|pointures?)$/], ['gouts', /^(gouts?|centres? d'interets?|j'aime|aime)$/], ['eviter', /^(a eviter|eviter|deja possede|deja eu|allergies?)$/],
    ['surprise', /^(surprends[- ]?moi|surprise)$/], ['commentaire', /^(commentaire|message|mot)$/]];
  function ligneProfil(t) {
    const m = /^([^:]{2,30}):\s*(.*)$/.exec(t); if (!m) return null;
    const k = sansAccent(m[1]).replace(/[’]/g, "'").trim(), c = CLES_PROFIL.find(([, re]) => re.test(k));
    return c ? [c[0], m[2].trim()] : null;
  }
  function profilDepuis(texte) {
    const r = profilVide();
    for (const brut of String(texte || '').split(/\r?\n/)) {
      const lp = ligneProfil(brut.slice(0, 1000).replace(/^[^\p{L}\p{N}€]+/u, '').trim()); if (!lp) continue;
      const [cle, v] = lp;
      if (cle === 'surprise') r.surprise = !/^(non|no|false|pas)\b/i.test(v) ;
      else if (v) r[cle] = court(r[cle] ? r[cle] + ' ; ' + v : v);
    }
    return r;
  }

  function nettoyer(t) {
    return t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/[\s,;:–—-]+([)\]])/g, '$1').replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—:,;|/·]+|[\s\-–—:,;|/·]+$/g, '');
  }

  // Renvoie [{texte, prix, url, occasion, ignore}] : une entrée par ligne utile ; `ignore` marque les lignes qui ressemblent
  // à un bonjour, un titre ou une signature (l'interface les décoche, sans rien perdre en silence).
  // shortcut : une idée par ligne uniquement (« pull, gants, bonnet » sur une ligne reste une seule idée) ; à revoir si les réponses arrivent ainsi.
  function decouper(texte) {
    const res = [];
    let fini = false;
    for (const brut0 of String(texte || '').split(/\r?\n/)) {
      const brut = brut0.slice(0, 1000);                     // une « ligne » hostile de 60 000 espaces figerait les expressions ci-dessous (audit n°8)
      const ligne = brut.replace(RE_WHATSAPP, '').trim();
      let t = ligne.replace(/^[^\p{L}\p{N}€]+/u, '').replace(/^\d{1,2}[.)/:]\s+|^\d{1,2}\s+[-–—]\s+/, '').trim();
      if (!t) continue;
      const puce = t !== ligne;
      const lp = ligneProfil(t);
      if (lp) { res.push({ texte: t, prix: null, url: null, occasion: null, favori: false, ignore: true }); continue; }   // info sur la personne : gardée mais décochée (voir profilDepuis)
      let favori = /^[^\p{L}\p{N}€]*[★⭐]/u.test(ligne);           // ★ en tête de ligne (avant l'effacement des puces)
      t = t.replace(/(^|\s)[★⭐]\uFE0F?(?=\s|$)/g, () => { favori = true; return ' '; }).trim();
      if (!puce && RE_FINALE.test(sansAccent(t))) fini = true;
      const ignore = fini || /:$/.test(t) || (!puce && RE_SALUT.test(sansAccent(t)));

      const liens = (t.match(RE_LIEN) || []).map(l => l.replace(/[.,;:!?)»\]]+$/, ''));
      t = t.replace(RE_LIEN, ' ');
      let url = liens[0] ? (/^www\./i.test(liens[0]) ? 'https://' + liens[0] : liens[0]) : null;

      let occasion = null;
      const mo = RE_OCC_NON.exec(t);
      if (mo) { occasion = 'non'; t = retirer(t, mo); }
      else { const mi = RE_OCC_OUI.exec(t); if (mi) { occasion = 'oui'; t = retirer(t, mi); } }

      let prix = null;
      const m = RE_PRIX.exec(t);
      if (m) {
        prix = nombre(m.groups.p1 ?? m.groups.p2 + (m.groups.c ? '.' + m.groups.c : ''));
        t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
      }
      t = nettoyer(t);

      const prec = res[res.length - 1];
      if (!t && prec && !prec.ignore) {                     // ligne « 20€ », « occasion ok » ou « https://… » seule : elle complète l'idée d'au-dessus
        if (!url && prix == null && occasion && prec.occasion == null) { prec.occasion = occasion; continue; }
        if (!url && prix != null && prec.prix == null) { prec.prix = prix; if (occasion && prec.occasion == null) prec.occasion = occasion; continue; }
        if (url && !puce && !prec.url) { prec.url = url; if (prix != null && prec.prix == null) prec.prix = prix; continue; }
      }
      if (!t && url) t = url.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0];
      if (!t) continue;
      res.push({ texte: t, prix, url, occasion, favori, ignore });
    }
    return res;
  }

  // ---------- budgets ----------
  const cout = i => i.prixReel ?? i.prix ?? 0;               // prix réel s'il est connu, sinon l'estimation
  const somme = (liste, f) => r2(liste.reduce((s, i) => s + f(i), 0));
  // engagé = tout ce qui est choisi ou plus loin ; dépensé = acheté ou plus loin ; reste = budget − engagé
  function bilan(p) {
    const engage = somme(p.idees.filter(i => i.statut !== 'idee'), cout);
    const depense = somme(p.idees.filter(i => STATUTS.indexOf(i.statut) >= 2), cout);
    return { budget: p.budget, engage, depense, reste: p.budget == null ? null : r2(p.budget - engage) };
  }
  function bilanTotal(personnes) {
    const bs = personnes.map(bilan);
    const avecBudget = bs.filter(b => b.budget != null);
    const budget = avecBudget.length ? somme(avecBudget, b => b.budget) : null;
    const engage = somme(bs, b => b.engage);
    return { budget, engage, depense: somme(bs, b => b.depense), reste: budget == null ? null : r2(budget - engage) };
  }
  const suivant = s => STATUTS[STATUTS.indexOf(s) + 1] || null;
  // « À acheter » : ce qui est choisi mais pas encore acheté, groupé par personne.
  const aAcheter = personnes => personnes
    .map(p => { const idees = p.idees.filter(i => i.statut === 'choisi'); return { personne: p, idees, total: somme(idees, cout) }; })
    .filter(g => g.idees.length);

  // Magasin d'une idée : celui écrit à la main, sinon le nom de domaine du lien (« www.amazon.fr » → Amazon).
  function magasinDe(url) {
    let h; try { h = new URL(String(url)).hostname.toLowerCase(); } catch (e) { return ''; }
    const parts = h.split('.'); if (parts.length < 2) return '';
    const nom = parts.length >= 3 && ['co', 'com', 'org', 'net'].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
    return nom ? nom[0].toUpperCase() + nom.slice(1) : '';
  }
  const magasinIdee = i => court(i.magasin, 40) || magasinDe(i.url);
  // « À acheter » par magasin : [{magasin, idees: [{idee, personne}], total}], le plus fourni d'abord, « sans magasin » ('') à la fin.
  function aAcheterParMagasin(personnes) {
    const m = new Map();
    for (const p of personnes) for (const i of p.idees) if (i.statut === 'choisi') { const k = magasinIdee(i); if (!m.has(k)) m.set(k, []); m.get(k).push({ idee: i, personne: p }); }
    return [...m].map(([magasin, idees]) => ({ magasin, idees, total: somme(idees, x => cout(x.idee)) }))
      .sort((a, b) => (a.magasin === '') - (b.magasin === '') || b.idees.length - a.idees.length || a.magasin.localeCompare(b.magasin));
  }
  const texteCourses = groupes => 'Liste de courses :\n' + groupes.map(g => `\n${g.magasin || 'Sans magasin'}\n` + g.idees.map(x => `- ${x.idee.texte} (${x.personne.nom}) – ${x.idee.prixReel != null ? x.idee.prixReel : x.idee.prix != null ? '~' + x.idee.prix : '?'}€`).join('\n')).join('\n');
  // Avancement : part des cadeaux choisis qui sont déjà achetés (ou plus loin).
  function compteurs(personnes) {
    const idees = personnes.flatMap(p => p.idees), au = n => idees.filter(i => STATUTS.indexOf(i.statut) >= n).length;
    const choisis = au(1), achetes = au(2);
    return { idees: idees.length, choisis, achetes, emballes: au(3), offerts: au(4), avancement: choisis ? r2(achetes / choisis) : 0 };
  }

  // ---------- relances ----------
  const dernierContact = p => p.relanceLe || p.demandeLe;
  const joursSansReponse = (p, auj) => joursEntre(dernierContact(p), auj);
  function relances(personnes, auj, n) {
    return personnes.filter(p => p.statut === 'demandee' && dernierContact(p))
      .map(p => ({ personne: p, jours: joursSansReponse(p, auj) }))
      .filter(r => r.jours >= n)
      .sort((a, b) => b.jours - a.jours);
  }

  const message = (modele, prenom, limite) => modele
    .replace(/\{prenom\}/g, () => prenom)
    .replace(/\{date\}/g, () => (iso(limite) ? dateFr(limite) : 'bientôt'));

  // ---------- données : valeurs par défaut, nettoyage à l'import, export ----------
  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const txt = (x, def = '') => (typeof x === 'string' ? x : def);
  const idSur = x => txt(x).replace(/[^\w-]/g, '').slice(0, 40);        // un identifiant ne sert qu'à relier : pas de guillemet ni de balise dans une adresse
  const uniques = liste => { const vus = new Set(); return liste.map(o => { let i = idSur(o.id) || nouvelId(); while (vus.has(i)) i = nouvelId(); vus.add(i); return { ...o, id: i }; }); };
  function normaliser(d) {
    d = d && typeof d === 'object' ? d : {};
    const n = parseInt(d.delai, 10);
    const r = {
      v: 1,
      modele: txt(d.modele).trim() && d.modele !== MODELE_V1 ? d.modele : MODELE,
      relance: txt(d.relance).trim() ? d.relance : RELANCE,
      limite: iso(d.limite) || ajouterJours(aujourdhui(), 7),
      delai: n >= 1 && n <= 60 ? n : 5,
      prenom: txt(d.prenom).trim().slice(0, 40),                                    // mon prénom : écrit dans les demandes que j'envoie
      demande: d.demande && typeof d.demande === 'object' ? { de: txt(d.demande.de).trim().slice(0, 60), limite: iso(d.demande.limite) || '' } : null,   // demande de liste reçue par lien (de qui, pour quand)
      site: (s => (/^https?:\/\/\S+$/i.test(s) ? s.replace(/(?:liste|reponse|index)\.html.*$/i, '').replace(/\/?$/, '/') : ''))(txt(d.site || d.pageListe).trim()),   // adresse du dossier web/ une fois publié (liste.html, reponse.html), avec « / » final
      personnes: (Array.isArray(d.personnes) ? d.personnes : []).filter(p => p && typeof p === 'object').map(p => ({
        id: p.id,
        nom: txt(p.nom).trim() || 'Sans nom',
        moi: p.moi === true,                                                          // vrai = ma propre liste (j'en suis le propriétaire) ; sinon c'est la liste de quelqu'un d'autre
        groupe: txt(p.groupe).trim().slice(0, 40) || (p.relation === 'ami' ? 'Amis' : 'Famille'),   // groupe (famille, amis…) ; l'ancien champ « relation » est converti
        partage: p.partage && typeof p.partage === 'object' && idSur(p.partage.id) ? { id: idSur(p.partage.id), maj: iso(p.partage.maj) || null } : null,   // liste reçue par lien (de qui, quand) ; sinon null
        budget: nombre(p.budget),
        profil: profilNet(p.profil),
        statut: STATUTS_PERSONNE.includes(p.statut) ? p.statut : 'a_demander',
        demandeLe: iso(p.demandeLe) || null,
        relanceLe: iso(p.relanceLe) || null,
        idees: uniques((Array.isArray(p.idees) ? p.idees : []).filter(i => i && typeof i === 'object')).map(i => ({
          id: i.id,
          texte: txt(i.texte).trim() || 'Idée',
          prix: nombre(i.prix),
          url: /^https?:\/\//i.test(txt(i.url).trim()) ? txt(i.url).trim() : null,   // pas de « javascript: » venu d'un import
          statut: STATUTS.includes(i.statut) ? i.statut : 'idee',
          prixReel: nombre(i.prixReel),
          occasion: i.occasion === 'oui' || i.occasion === 'non' ? i.occasion : null,   // d'occasion possible : oui / non / inconnu
          favori: i.favori === true,                                                    // coup de cœur ★ (priorité)
          magasin: court(i.magasin, 40),                                                // vide = déduit du lien (magasinIdee)
          note: txt(i.note).trim(),
        })),
      })),
    };
    r.personnes = uniques(r.personnes);
    r.groupes = groupes({ groupes: d.groupes, personnes: r.personnes });
    return r;
  }
  // Groupes (famille, amis…) : ceux créés + ceux des personnes, sans doublon, dans l'ordre ; un groupe vide reste tant qu'on ne le supprime pas.
  const groupes = d => [...new Set([...(Array.isArray(d.groupes) ? d.groupes : []).map(g => txt(g).trim().slice(0, 40)).filter(Boolean), ...d.personnes.filter(p => !p.moi).map(p => p.groupe)])];
  // Adresse du dossier web/ quand la page est servie par un vrai site (https://…) : le proche qui ouvre le lien renvoie sa liste avec un lien vers ce même site.
  // Jamais une adresse locale (Mac, réseau maison, app Android) : personne d'autre ne pourrait l'ouvrir.
  function siteDepuisPage(href) {
    let u; try { u = new URL(href); } catch (e) { return ''; }
    const h = u.hostname;
    if (!/^https?:$/.test(u.protocol) || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || !h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return '';
    return u.origin + u.pathname.replace(/[^/]*$/, '');
  }
  const SITE_PUBLIE = 'https://marinlagoutte-cmd.github.io/listes-noel/';   // copie publique de web/ (GitHub Pages) : utilisée tant que Réglages > Adresse du site est vide
  const exporter = d => JSON.stringify(d, null, 1);
  function importer(texte) {
    let d;
    try { d = JSON.parse(texte); } catch (e) { return { erreur: "Ce texte n'est pas une sauvegarde (JSON illisible)." }; }
    if (!d || !Array.isArray(d.personnes)) return { erreur: "Ce texte n'est pas une sauvegarde de Listes de Noël." };
    return { donnees: normaliser(d) };
  }

  // ---------- partager une liste (idées, prix, liens, occasion) ----------
  const libOcc = o => (o === 'oui' ? 'occasion OK' : o === 'non' ? 'neuf seulement' : '');
  // Texte lisible partout et relu tel quel par « Coller la réponse » : « 1. Un livre – 20€ – occasion OK – https://… »
  const texteListe = (idees, profil) => 'Ma liste de Noël :\n' + idees.map((i, k) =>
    `${k + 1}. ${i.favori ? '★ ' : ''}${[i.texte + (i.note ? ` (${i.note})` : ''), i.prix != null ? `${i.prix}€` : '', libOcc(i.occasion), i.url || ''].filter(Boolean).join(' – ')}`).join('\n') +
    (profilRempli(profil) ? '\n\nÀ savoir sur moi :' + [['Tailles', profil.tailles], ['Goûts', profil.gouts], ['À éviter', profil.eviter], ['Surprends-moi', profil.surprise ? 'oui' : ''], ['Commentaire', profil.commentaire]]
      .filter(([, v]) => v).map(([k, v]) => `\n${k} : ${v}`).join('') : '');
  // La liste voyage dans l'adresse (après le #, jamais envoyé à un serveur) : base + '#' + JSON en base64 sûr pour les URL.
  const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const lienListe = (base, nom, idees, id, profil) => `${base}#${b64(JSON.stringify({ n: nom, id, i: idees.map(i => (i.favori || i.note ? [i.texte, i.prix, i.url, i.occasion, i.favori ? 1 : 0, i.note || ''] : [i.texte, i.prix, i.url, i.occasion])),
    pr: profilRempli(profil) ? [profil.tailles, profil.gouts, profil.eviter, profil.surprise ? 1 : 0, profil.commentaire] : undefined }))}`;
  // Lecture d'un tel lien (venu de n'importe où : tout est revalidé, seuls les liens http(s) sont gardés) ; null si illisible.
  function decoderListe(hash) {
    try {
      const d = JSON.parse(deb64(String(hash || '').replace(/^#/, '')));
      if (!d || !Array.isArray(d.i)) return null;
      const r = { nom: txt(d.n).trim().slice(0, 60), id: idSur(d.id), idees: d.i.filter(Array.isArray).slice(0, 200).map(([t, p, u, o, f, n]) => {
        const i = { texte: txt(t).trim().slice(0, 200) || 'Idée', prix: nombre(p), url: /^https?:\/\//i.test(txt(u).trim()) ? txt(u).trim() : null, occasion: o === 'oui' || o === 'non' ? o : null };
        if (f === 1) i.favori = true;
        if (court(n)) i.note = court(n);
        return i; }) };
      if (Array.isArray(d.pr)) { const pr = profilNet({ tailles: d.pr[0], gouts: d.pr[1], eviter: d.pr[2], surprise: d.pr[3] === 1, commentaire: d.pr[4] }); if (profilRempli(pr)) r.profil = pr; }
      return r;
    } catch (e) { return null; }
  }

  // Demande de liste (« X te demande ta liste ») : lien = site + '#/demande/' + JSON en base64 ; lu par l'app (ou le site) de la personne.
  const lienDemande = (base, de, limite) => `${base}#/demande/${b64(JSON.stringify({ de, limite: iso(limite) || '' }))}`;
  function decoderDemande(s) {
    try {
      const d = JSON.parse(deb64(String(s || '').trim().split('/').pop()));
      return d && typeof d === 'object' ? { de: txt(d.de).trim().slice(0, 60), limite: iso(d.limite) || '' } : null;
    } catch (e) { return null; }
  }

  // Mise à jour d'une liste déjà reçue : prix, lien et occasion repris, idées nouvelles ajoutées ; une idée retirée par son propriétaire
  // disparaît sauf si j'ai déjà avancé dessus (choisi, acheté…). Retourne la nouvelle liste d'idées (le suivi est conservé).
  function fusionner(p, liste) {
    const cle = i => sansAccent(i.texte).replace(/\s+/g, ' ').trim();
    const anciennes = p.idees.slice(), idees = [];
    for (const n of liste.idees) {
      const j = anciennes.findIndex(a => cle(a) === cle(n)), a = j >= 0 ? anciennes.splice(j, 1)[0] : null;
      idees.push(a ? { ...a, prix: n.prix, url: n.url, occasion: n.occasion, favori: !!n.favori, note: n.note || a.note }
        : { id: nouvelId(), texte: n.texte, prix: n.prix, url: n.url, occasion: n.occasion, favori: !!n.favori, magasin: '', statut: 'idee', prixReel: null, note: n.note || '' });
    }
    return idees.concat(anciennes.filter(a => a.statut !== 'idee'));
  }

  return { STATUTS, STATUTS_PERSONNE, LIBELLES, MODELE, RELANCE, aujourdhui, iso, joursEntre, ajouterJours, dateFr, dateCourte,
    joursAvantNoel, nombre, eur, decouper, cout, bilan, bilanTotal, suivant, aAcheter, dernierContact, joursSansReponse,
    relances, message, nouvelId, profilVide, profilNet, profilRempli, profilDepuis, magasinDe, magasinIdee, aAcheterParMagasin, texteCourses, compteurs, normaliser, siteDepuisPage, SITE_PUBLIE, exporter, importer, lien, libOcc, texteListe, lienListe, decoderListe, fusionner, lienDemande, decoderDemande, groupes };
})();
if (typeof module !== 'undefined') module.exports = Core;
