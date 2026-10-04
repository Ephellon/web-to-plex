let script = {
	"url": "*://*.thetvdb.com/series/*",

	"ready": () => !$('#series_basic_info').empty,

	"init": () => {
		const info = script.getInfo()
			, title = $('#series_title, .translated_title').first
			, image = $('img[src*="/posters/"]').first;

		if(!title)
			return 1000;

		// T15: the year comes from the "First Aired" row ("January 20, 2008"); the old text split never found it and
		// fell back to `YEAR`, which only exists inside utils.js (ReferenceError)
		return { type: 'show', title: title.textContent.trim(), year: +(/\d{4}/.exec(info.first_aired ?? '') ?? [0])[0], image: image?.src, TVDbID: script.getTVDbID(info) };
	},

	// The "Basic info" rows by name (`<li><strong>First Aired</strong><span>January 20, 2008</span></li>` → first_aired)
	"getInfo": () => {
		const info = {};

		for(const item of $('#series_basic_info li')) {
			const name = item.querySelector('strong')
				, value = item.querySelector('span');

			if(name && value)
				info[name.textContent.trim().replace(/\W+/g, '_').toLowerCase()] = value.textContent.replace(/\s+/g, ' ').trim();
		}

		return info;
	},

	// T15: series pages use slugs now (/series/breaking-bad); the ID is the "TheTVDB.com Series ID" row
	"getTVDbID": (info = script.getInfo()) => {
		const id = (/\/series\/(\d+)/.exec(top.location.pathname) ?? [])[1] ?? (info.thetvdb_com_series_id ?? '').replace(/\D+/g, '');

		return id || void null;
	},
};
