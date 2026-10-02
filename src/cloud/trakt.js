/** Trakt (app.trakt.tv, a SvelteKit app; trakt.tv redirects there)
 * The item comes from the page's JSON-LD (Movie or TVSeries). The app swaps it on every in-app navigation, so the
 * data only counts once its `url` names the current path. The pages link no IMDb/TMDb/TVDb IDs; Identify looks
 * the item up by title and year. The old "minions" (#info-wrapper .action-buttons) have no counterpart; dropped.
**/

let script = {
    url: '*://*.trakt.tv/(movie|show)s/*',

    ready: () => !!script.getData(),

    init: () => {
        const data = script.getData();

        if(!data)
            return 1000;

        const type = script.getType(data)
            , title = (data.name || '').trim()
            , year = parseInt(data.datePublished)
            , image = data.image;

        // Season, episode and person pages carry other types: nothing to show there
        if(!type || !title)
            return -1;

        return { type, title, year, image };
    },

    // The JSON-LD item describing the current path, or null while the app still shows the previous page's data
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
                if(item?.url && new URL(item.url, location.href).pathname.replace(/\/+$/, '') == path)
                    return item;
        }

        return null;
    },

    getType: data => ({ Movie: 'movie', TVSeries: 'show' })[data['@type']],
};
