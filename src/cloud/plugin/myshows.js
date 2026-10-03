// Web to Plex - My Shows Plugin
// Aurthor(s) - @enchained (2018)

/** Show pages carry JSON-LD (`TVSeries`: name, startDate, image, the IMDb ID as `identifier` and `sameAs`); the old
 * `main > h1` / `div.clear > p.flat` layout is gone (PL2). On myshows.me the name is the Russian one, on en.myshows.me
 * the English one; the IMDb ID identifies the show either way.
**/

let plugin = {
    url: '*://*.myshows.me/view/\\d+/*',

    ready: () => !!plugin.getData(),

    init: () => {
        const data = plugin.getData();

        if(!data)
            return 1000;

        const title = (data.name || '').trim()
            , year = parseInt(data.startDate) || 0
            , image = typeof data.image == 'string' ? data.image : data.image?.url
            , IMDbID = plugin.getIMDbID(data);

        if(!title)
            return 1000;

        return { type: 'show', title, year, image, IMDbID };
    },

    getData: () => {
        for(const element of document.querySelectorAll('script[type="application/ld+json"]')) {
            let data;

            try {
                data = JSON.parse(element.textContent);
            } catch {
                continue;
            }

            for(const item of [].concat(data['@graph'] || data))
                if(item?.['@type'] == 'TVSeries')
                    return item;
        }

        return null;
    },

    getIMDbID: data => {
        const identifier = [].concat(data.identifier ?? []).find(id => /imdb/i.test(id?.propertyID ?? ''))?.value;

        return (/\b(tt\d+)\b/.exec(`${ identifier ?? '' } ${ data.sameAs ?? '' }`) || [])[1];
    },
};
