let script = {
	"url": "*://*.flickmetrix.com/(watchlist|seen|favourites|trash|share|\\?)?",

	"ready": () => $('#loadingOverlay > *').empty || getComputedStyle($('#loadingOverlay').first).display === 'none',

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		if(script.isList())
			return script.processList(ready);

		let element = $('#singleFilm'), type = 'movie';

		_title  = $('.title').first;
		_year   = $('.title + *').first;
		_image  = $('img').first;

		let title  = _title.textContent.trim(),
			year   = +_year.textContent.replace(/^\(|\)$/g, '').trim(),
			image  = _image.src,
			IMDbID = script.getIMDbID(element);

		return { type, title, year, image, IMDbID };
	},

	"getIMDbID": (element) => {
		let link = $('[href*="imdb.com/title/tt"]').first;

		if(link)
			return link.href.replace(/^.*imdb\.com\/title\//, '').replace(/\/(?:maindetails\/?)?$/, '');
	},

	"isList": () => $('#singleFilm').empty && !/\bid=\d+\b/i.test(location.search),

	"processList": (ready) => {
		let _title, _year, _image, R = RegExp;

		let films = [], list = $('.film'), length = list.length - 1, type = 'movie';

		list.forEach((element, index, array) => {
			_title = $('.title', element).first;
			_year = $('.title + *', element).first;
			_image = $('img', element).first;

			if(!_title)
				return;

			let title  = _title.textContent.trim(),
				year   = +_year.textContent.replace(/^\(|\)$/g, '').trim(),
				image  = _image.src,
				IMDbID = script.getIMDbID(element);

			films.push({ type, title, year, image, IMDbID });
		});

		// FM1: `Notification` here is the browser's (the extension's notice class lives inside utils.js), and
		// `new Notification('error', …)` threw; an empty list is usually one still loading, so warn once and retry
		if(!films.length) {
			if(!script.warned)
				console.warn('[flickmetrix] No films found in the list yet');
			script.warned = true;

			return 1000;
		}

		return films;
	},
};
