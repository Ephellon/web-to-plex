/** MovieMeter title pages (moviemeter.nl/film/<id>)
 * The page (2026) has JSON-LD `Movie` (name, image, `sameAs` = the IMDb page) and og: tags; its dates are database
 * dates, so the year comes from the heading ("Fools Rush In (1997)") or og:title ("… (Film, 1997) - MovieMeter.nl").
 * The old `ready` waited for `.rating + p font`, which is gone, so the script never ran; `.details` and `.poster` are
 * gone too.
**/

let script = {
    url: '*://*.moviemeter.nl/film/\\d+',

    ready: () => script.getData() != null,

    init: () => {
        const data = script.getData();

        if(!data?.name)
            return 1000;

        const heading = $('h1').first?.textContent ?? ''
            , ogTitle = $('meta[property="og:title"]').first?.content ?? ''
            , ogType = $('meta[property="og:type"]').first?.content ?? ''
            , year = (/\((\d{4})\)\s*$/.exec(heading.trim()) ?? /\(\w+, (\d{4})\)/.exec(ogTitle) ?? [])[1];

        return {
            type: data['@type'] == 'TVSeries' || /tv_show|series/i.test(ogType) || /\((Serie|Series), /i.test(ogTitle) ? 'show' : 'movie',
            title: data.name.trim(),
            year: +year || null,
            image: data.image?.url ?? data.image ?? $('meta[property="og:image"]').first?.content,
            IMDbID: (/imdb\.com\/title\/(tt\d+)/.exec([].concat(data.sameAs ?? []).join(' ')) ?? [])[1],
        };
    },

    // The page's JSON-LD Movie or TVSeries
    getData: () => {
        for(const element of $('script[type="application/ld+json"]')) {
            try {
                const item = [].concat(JSON.parse(element.textContent)).find(item => /^(Movie|TVSeries)$/.test(item?.['@type']));

                if(item)
                    return item;
            } catch {
                continue;
            }
        }

        return null;
    },
};
