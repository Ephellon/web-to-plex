/** Rotten Tomatoes title pages (/m/…, /tv/…) and browse pages (/browse/…)
 * Title pages: the item comes from the page's JSON-LD (Movie, TVSeries; a TVSeason gives its series), checked against
 * the current path. Browse pages: the JSON-LD ItemList (its items are nested one list deep). The pre-2024 selectors
 * (#reviews, .playButton + .title, time, .mb-movie, .movieTitle), the `/t/` glob (shows are under /tv/ now) and the
 * "minions" are gone.
**/

let script = {
    url: '*://*.rottentomatoes.com/(m|tv|browse)/*',

    ready: () => (script.getType() == 'list' ? script.getList().length > 0 : script.getItem() != null),

    init: () => {
        const type = script.getType();

        if(type == 'list') {
            const items = script.getList();

            return items.length ? items : 1000;
        }

        if(type == 'error')
            return -1;

        return script.getItem() ?? 1000;
    },

    getType: () => {
        const { pathname } = top.location;

        return /^\/browse\//i.test(pathname) ? 'list' : /^\/m\//i.test(pathname) ? 'movie' : /^\/tv\//i.test(pathname) ? 'show' : 'error';
    },

    // Every JSON-LD object on the page
    getData: () => {
        const items = [];

        for(const element of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                items.push(...[].concat(JSON.parse(element.textContent)));
            } catch {
                continue;
            }
        }

        return items.filter(item => item && typeof item == 'object');
    },

    // "1994-09-01" or "2026" → 1994 or 2026 (T9: the old code deleted the year instead of keeping it)
    year: value => +((value ?? '') + '').replace(/^\D*(\d{4})[^]*$/, '$1') || null,

    // A schema.org item → { type, title, year, image }; null for anything that is not a movie or show
    toItem: item => {
        const data = item?.['@type'] == 'TVSeason' ? item.partOfSeries : item
            , type = data?.['@type'] == 'Movie' ? 'movie' : data?.['@type'] == 'TVSeries' ? 'show' : null;

        if(!type || !data.name)
            return null;

        return { type, title: data.name.trim(), year: script.year(data.dateCreated ?? data.startDate ?? data.datePublished), image: data.image?.url ?? data.image };
    },

    // The title page's item, when the JSON-LD describes the current page; -1 for pages that are not a movie or show
    getItem: () => {
        const path = top.location.pathname.replace(/\/+$/, '')
            , data = script.getData().find(item => item.url && new URL(item.url, top.location.href).pathname.replace(/\/+$/, '') == path);

        if(!data)
            return null;

        return script.toItem(data) ?? -1;
    },

    // A browse page's items
    getList: () => {
        const list = script.getData().find(item => item['@type'] == 'ItemList');

        return [].concat(list?.itemListElement ?? [])
            .flatMap(entry => (entry?.['@type'] == 'ItemList' ? [].concat(entry.itemListElement ?? []) : [entry]))
            .map(entry => script.toItem(entry?.item ?? entry))
            .filter(item => item);
    },
};
