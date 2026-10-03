/** Free Movies Cinema: title pages moved from `/watch/…` to `/movies/<slug>/` and `/tv-series/<slug>/`, and carry
 * JSON-LD (`Movie`, `TVSeries`) with name, datePublished and image (PL1). The item counts only when its `url` names the
 * current path.
**/

let plugin = {
    url: '*://*.freemoviescinema.com/(movies|tv-series)/*',

    ready: () => !!plugin.getData(),

    init: () => {
        const data = plugin.getData();

        if(!data)
            return 1000;

        const type = ({ Movie: 'movie', TVSeries: 'show' })[data['@type']]
            , title = (data.name || '').trim()
            , year = parseInt(data.datePublished) || 0
            , image = typeof data.image == 'string' ? data.image : data.image?.url;

        if(!type || !title)
            return -1;

        return { type, title, year, image };
    },

    // The JSON-LD item describing the current path
    getData: () => {
        const path = top.location.pathname.replace(/\/+$/, '');

        for(const element of document.querySelectorAll('script[type="application/ld+json"]')) {
            let data;

            try {
                data = JSON.parse(element.textContent);
            } catch {
                continue;
            }

            for(const item of [].concat(data['@graph'] || data))
                if(item?.url && /^(Movie|TVSeries)$/.test(item['@type']) && new URL(item.url, location.href).pathname.replace(/\/+$/, '') == path)
                    return item;
        }

        return null;
    },
};
