/** Amazon Prime Video detail pages (amazon.com/gp/video/detail/…)
 * The page (2026) has no JSON-LD or og: tags. The title is the title art's alt text (h1[data-testid="title-art"] img),
 * with the tab title ("Watch The Boys - Season 1 | Prime Video") as a fallback; the year is the release-year badge; the
 * image is the hero background (T20: the old fallback read `.src` of a list, always undefined); an episode list makes it
 * a show. The pre-2024 selectors (#aiv-content-title, .dv-node-dp-title, .av-bgimg__div, .av-fallback-packshot), the
 * `YEAR` fallback (a utils.js local: ReferenceError) and the "minions" (#dv-action-box) are gone.
**/

let script = {
    url: '*://*.amazon.com/*/video/detail/*',

    ready: () => script.getTitle() != null,

    init: () => {
        const title = script.getTitle();

        if(!title)
            return 1000;

        return {
            type: script.getType(),
            title,
            year: +($('[data-automation-id="release-year-badge"]').first?.textContent.trim().match(/\d{4}/) ?? [0])[0] || null,
            image: $('[data-automation-id="hero-background"] img, img[data-testid="base-image"]').first?.src,
        };
    },

    getTitle: () => {
        const art = $('h1[data-testid="title-art"] img').first?.alt?.trim()
            , tab = (/^Watch (.+?)(?: - Season \d+)? \| Prime Video$/.exec(document.title) ?? [])[1];

        return art || tab || null;
    },

    getType: () => ($('[data-automation-id="btf-episodes-tab"], [data-automation-id^="ep-title-episode"]').empty ? 'movie' : 'show'),
};
