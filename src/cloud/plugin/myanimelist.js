// Web to Plex - My Anime List Plugin
// Aurthor(s) - @ephellon (2018)

/** The anime page's `og:` meta (title, type, image) and its information rows ("English:", "Aired:"). The table
 * layout the old selectors read is gone (M1).
**/

let plugin = {
    url: '*://*.myanimelist.net/anime/\\d+/*',

    ready: () => !!plugin.meta('og:type') && !!plugin.meta('og:title'),

    init: () => {
        const type = ({ 'video.movie': 'movie', 'video.tv_show': 'show' })[plugin.meta('og:type')]
            // The English title matches Plex and TMDb best; MAL's main title is often the romanised one
            , title = (plugin.info('English') || plugin.meta('og:title') || '').trim()
            , year = +(/\b(\d{4})\b/.exec(plugin.info('Aired') || plugin.info('Premiered') || '') || [])[1] || 0
            , image = plugin.meta('og:image');

        if(!title)
            return 1000;

        // Music videos, specials and the rest carry other og:types: nothing to show there
        if(!type)
            return -1;

        return { type, title, year, image };
    },

    meta: property => document.querySelector(`meta[property="${ property }"]`)?.content ?? null,

    // The value of an information row such as `<span class="dark_text">English:</span> Cowboy Bebop`
    info: label => {
        for(const row of document.querySelectorAll('.leftside .spaceit_pad')) {
            const name = row.querySelector('.dark_text');

            if(name && name.textContent.trim() == `${ label }:`)
                return row.textContent.replace(name.textContent, '').trim();
        }

        return null;
    },
};
