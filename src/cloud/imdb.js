/** IMDb title pages (movie and TV) and list pages
 * Title pages: the item comes from the page's JSON-LD (Movie, TVSeries, …), checked against the title ID in the path;
 * without it, from the hero heading (h1[data-testid="hero__pageTitle"]), og:type and the release-info link.
 * List pages: the JSON-LD ItemList when present, otherwise the rendered rows. The pre-2021 selectors (.title_wrapper,
 * #titleYear, .originalTitle, .lister-item), the forced "mode=simple" reload and the "minions" are gone.
**/

let script = {
    url: '*://*.imdb.com/(title|list)/(tt|ls)\\d+/(#*|?*)?$',

    ready: () => (script.getType() == 'list' ? script.getList().length > 0 : script.getItem() != null),

    init: () => {
        const type = script.getType();

        if(type == 'list') {
            const items = script.getList();

            return items.length ? items : 1000;
        }

        if(type != 'title')
            return -1;

        return script.getItem() ?? 1000;
    },

    getType: () => {
        const { pathname } = top.location;

        return /^\/list\/ls\d+/.test(pathname) ? 'list' : /^\/title\/tt\d+/.test(pathname) ? 'title' : 'error';
    },

    getIMDbID: () => (/\/title\/(tt\d+)/.exec(top.location.pathname) || [])[1],

    // Every JSON-LD object on the page (top level and @graph)
    getData: () => {
        const items = [];

        for(const element of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                items.push(...[].concat(JSON.parse(element.textContent)).flatMap(data => [].concat(data?.['@graph'] ?? data)));
            } catch {
                continue;
            }
        }

        return items.filter(item => item && typeof item == 'object');
    },

    // 'movie' or 'show' for a schema.org type (null for episodes, people and the rest)
    mapType: type => (/^(Movie|TVMovie|TVSpecial|ShortFilm)$/.test(type) ? 'movie' : /^TV(Series|MiniSeries)$/.test(type) ? 'show' : null),

    year: value => +((value ?? '') + '').replace(/^\D*(\d{4})[^]*$/, '$1') || null,

    // The title page's item; -1 for pages that are not a movie or show (episodes, …); null while the data is missing
    getItem: () => {
        const IMDbID = script.getIMDbID();

        if(!IMDbID)
            return null;

        const data = script.getData().find(item => item.url?.includes(`/title/${ IMDbID }`) && item.name);

        if(data) {
            const type = script.mapType(data['@type']);

            if(!type)
                return -1;

            return { type, title: data.name.trim(), year: script.year(data.datePublished) ?? script.getHeroYear(), image: script.getImage(data.image), IMDbID };
        }

        const heading = document.querySelector('h1[data-testid="hero__pageTitle"]')
            , ogType = document.querySelector('meta[property="og:type"]')?.content;

        if(!heading)
            return null;

        const title = (heading.querySelector('[data-testid="hero__primary-text"]') ?? heading).textContent.trim()
            , type = ogType == 'video.tv_show' ? 'show' : ogType == 'video.movie' ? 'movie' : null
            , image = document.querySelector('[data-testid="hero-media__poster"] img')?.src;

        if(!title)
            return null;

        if(!type)
            return -1;

        return { type, title, year: script.getHeroYear(), image, IMDbID };
    },

    // The year under the hero heading ("1994", or "2008–2013" for a series)
    getHeroYear: () => script.year(document.querySelector('h1[data-testid="hero__pageTitle"] ~ ul a[href*="/releaseinfo"]')?.textContent),

    getImage: image => (typeof image == 'string' ? image : image?.url ?? image?.contentUrl),

    // A list page's items (only those the page has rendered or described)
    getList: () => {
        const list = script.getData().find(item => item['@type'] == 'ItemList' && item.itemListElement?.length);

        if(list) {
            return list.itemListElement
                .map(entry => entry.item ?? entry)
                .map(item => {
                    const IMDbID = (/\/title\/(tt\d+)/.exec(item.url ?? '') || [])[1]
                        , row = IMDbID && script.getRow(IMDbID)
                        , type = script.mapType(item['@type']) ?? row?.type;

                    if(!IMDbID || !item.name || !type)
                        return null;

                    // The list's JSON-LD has no dates and names titles in their original language; the rendered row has
                    // the year and the title as the page shows it (the viewer's language, as Plex and TMDb mostly do)
                    return { type, title: row?.title || item.name.trim(), year: script.year(item.datePublished) ?? row?.year ?? null, image: script.getImage(item.image) ?? row?.image, IMDbID };
                })
                .filter(item => item)
        }

        return [...document.querySelectorAll('li.ipc-metadata-list-summary-item')]
            .map(element => script.process(element))
            .filter(item => item);
    },

    // The rendered row for a title ID on a list page
    getRow: IMDbID => {
        const link = document.querySelector(`li.ipc-metadata-list-summary-item a[href*="/title/${ IMDbID }/"]`);

        return link ? script.process(link.closest('li.ipc-metadata-list-summary-item')) : null;
    },

    // One list row: title link, "1. Title" heading (`.ipc-title--title`), and metadata (`.dli-title-metadata li`: year
    // "1994" or "2008–2013", length, rating; or "TV Series")
    process: element => {
        const link = element?.querySelector('a[href*="/title/tt"]')
            , heading = element?.querySelector('.ipc-title--title, h3.ipc-title__text, .ipc-title__text');

        if(!link || !heading)
            return null;

        const IMDbID = (/\/title\/(tt\d+)/.exec(link.href) || [])[1]
            , title = heading.textContent.replace(/^\s*\d+\.\s*/, '').trim()
            , metadata = [...element.querySelectorAll('.dli-title-metadata li, .dli-title-metadata-item, [class*="title-metadata-item"]')].map(item => item.textContent.trim())
            , released = metadata.find(text => /^\d{4}/.test(text)) ?? ''
            , type = /\d{4}\s*[-‐-―]/.test(released) || metadata.some(text => /^TV (Mini )?Series$/i.test(text)) ? 'show' : 'movie';

        if(!IMDbID || !title)
            return null;

        return { type, title, year: script.year(released), image: element.querySelector('img.ipc-image, img')?.src, IMDbID };
    },
};
