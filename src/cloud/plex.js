/** Plex web app details pages (app.plex.tv/desktop/#!/server/<id>/details?key=…, and the free Movies & Shows provider)
 * The 2026 app marks its details page with `data-testid`: `metadata-title` (the movie or show name; on an episode, the
 * show), `metadata-line1` ("R    2007    1hr 50min    Horror" for a movie, "TV-MA    2013    Drama" for a show,
 * "Season 2    Episode 12" for an episode) and a "Seasons" hub on show pages. The `data-qa-id` selectors
 * (maintitle, secondtitle, celltitle) are gone, and the `YEAR` fallback was a utils.js local (ReferenceError).
**/

let script = {
    url: '*://app.plex.tv/desktop/?#!/(server/(?:[a-f\\d]+)|provider/(?:tv.plex.provider.vod))/(details|list)\\?*',

    ready: () => !$('[data-testid="metadata-title"]').empty,

    timeout: 5000,

    init: () => {
        const title = $('[data-testid="metadata-title"]').first?.textContent.trim();

        if(!title)
            return 5000;

        const line1 = $('[data-testid="metadata-line1"]').first?.textContent ?? ''
            , episode = /\bSeason\s+\d+\s+Episode\s+\d+/i.test(line1)
            , year = episode ? null : +(/\b(1[89]\d{2}|2\d{3})\b/.exec(line1) ?? [])[1] || null;

        return { type: script.getType(line1), title, year, image: $('[data-testid="metadata-poster"] img').first?.src };
    },

    // A show page has a "Seasons" hub (or season links); an episode page names its season and episode
    getType: (line1 = $('[data-testid="metadata-line1"]').first?.textContent ?? '') => {
        if(/\bSeason\s+\d+\s+Episode\s+\d+/i.test(line1))
            return 'show';

        const hubs = [...$('[data-testid="hubTitle"], [data-testid="metadataTitleLink"]')].map(element => element.textContent.trim());

        return hubs.some(text => /^Seasons?\b/i.test(text)) ? 'show' : 'movie';
    },
};
