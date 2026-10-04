/** Fandango movie pages (fandango.com/<slug>-<id>/movie-overview)
 * FD1: the item comes from the page's JSON-LD Movie, checked against the current path. Its name carries the year
 * ("Digger (2026)"), which wins over `datePublished` (the release date). The pre-2025 selectors (.subnav__title,
 * .movie-details__release-date, .movie-details__movie-img) are gone, so init threw on `textContent`; the "minions"
 * (.subnav ul) are gone too.
**/

let script = {
    url: '*://*.fandango.com/[\\w\\-]+/movie-overview',

    ready: () => script.getItem() != null,

    init: () => script.getItem() ?? 1000,

    // The JSON-LD Movie whose `url` is this page; null while there is none
    getItem: () => {
        const path = top.location.pathname.replace(/\/+$/, '');

        for(const element of $('script[type="application/ld+json"]')) {
            let data;

            try {
                data = JSON.parse(element.textContent);
            } catch {
                continue;
            }

            for(const item of [].concat(data?.['@graph'] ?? data)) {
                if(item?.['@type'] != 'Movie' || !item.name || (item.url && new URL(item.url, top.location.href).pathname.replace(/\/+$/, '') != path))
                    continue;

                const [, title, year] = /^\s*(.+?)\s*(?:\((\d{4})\))?\s*$/.exec(item.name);

                return { type: 'movie', title, year: +(year ?? (/\d{4}/.exec(item.datePublished ?? '') ?? [])[0]) || null, image: item.image?.url ?? item.image };
            }
        }

        return null;
    },
};
