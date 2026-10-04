/** Tubi title pages (tubitv.com/movies/<id>/…, /series/<id>/…)
 * SW2: the item comes from the page's JSON-LD `@graph` (Movie, TVSeries), checked against the current path: name,
 * `dateCreated` year, image (og:image when the item has none). The hashed class selectors (._1mbQP, ._3BhXb, ._2TykB)
 * are gone, and the page's type no longer has to be guessed from the path.
**/

let script = {
    url: '*://*.tubitv.com/(movies|series)/\\d+/*',

    ready: () => script.getItem() != null,

    init: () => script.getItem() ?? 1000,

    // The JSON-LD item whose `url` is this page; -1 for anything that is not a movie or show; null while there is none
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
                if(!item?.url || new URL(item.url, top.location.href).pathname.replace(/\/+$/, '') != path)
                    continue;

                const type = item['@type'] == 'Movie' ? 'movie' : item['@type'] == 'TVSeries' ? 'show' : null;

                if(!type || !item.name)
                    return -1;

                return {
                    type,
                    title: item.name.trim(),
                    year: +(/\d{4}/.exec(item.dateCreated ?? item.startDate ?? item.releasedEvent?.startDate ?? '') ?? [0])[0] || null,
                    image: item.image?.url ?? item.image ?? $('meta[property="og:image"]').first?.content,
                };
            }
        }

        return null;
    },
};
