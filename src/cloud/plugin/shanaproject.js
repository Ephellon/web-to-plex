// Web to Plex - Shana Project Plugin
// Aurthor(s) - @ephellon (2018)
let plugin = {
	"url": "*://*.shanaproject.com/series/\\d+",

	"init": () => {
		let title = $('.overview i, #header_big .header_info_block')
				.first.textContent.trim(),
			year = +($('#header_big .header_info_block + *')
				.first.textContent.trim()
				.replace(/[^]*(\d{4})[^]*/m, '$1')),
			image = (/url\((["']?)(.+?)\1\)/i.exec($('#header_big .header_display_box').first?.style['background-image'] ?? '') ?? [])[2];

		// SH1: the URL without its CSS quotes, and none for the site's "no art" placeholder (//static.shanaproject.com/no-art.jpg)
		if(!image || /\/no-art\.\w+$/i.test(image))
			image = null;

		title = title.replace(RegExp(`\\s*\\(${ year }\\)`), '');

		return {
			type: 'show',
			title,
			year,
			image
		};
	},
};
