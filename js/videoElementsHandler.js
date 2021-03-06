/**
 * Expose a function that must be called when the library is loaded.
 * And also a helper function.
 */
module.exports = videoElementsHandler;
module.exports.observeVideo = observeVideo;
module.exports.releaseVideo = releaseVideo;

/**
 * Dependencies.
 */
var
	debug = require('debug')('iosrtc:videoElementsHandler'),
	MediaStreamRenderer = require('./MediaStreamRenderer'),


/**
 * Local variables.
 */

	// RegExp for MediaStream blobId.
	MEDIASTREAM_ID_REGEXP = new RegExp(/^MediaStream_/),

	// RegExp for Blob URI.
	BLOB_URI_REGEX = new RegExp(/^blob:/),

	// Dictionary of MediaStreamRenderers (provided via module argument).
	// - key: MediaStreamRenderer id.
	// - value: MediaStreamRenderer.
	mediaStreamRenderers,

	// Dictionary of MediaStreams (provided via module argument).
	// - key: MediaStream blobId.
	// - value: MediaStream.
	mediaStreams,

	// Video element mutation observer.
	videoObserver = new MutationObserver(function (mutations) {
		var i, numMutations, mutation, video;

		for (i = 0, numMutations = mutations.length; i < numMutations; i++) {
			mutation = mutations[i];

			// HTML video element.
			video = mutation.target;

			// .src or .srcObject removed.
			if (!video.src && !video.srcObject) {
				// If this video element was previously handling a MediaStreamRenderer, release it.
				releaseMediaStreamRenderer(video);
				continue;
			}

			handleVideo(video);
		}
	});


function videoElementsHandler(_mediaStreams, _mediaStreamRenderers) {
	var
		existingVideos = document.querySelectorAll('video'),
		i, len, video;

	mediaStreams = _mediaStreams;
	mediaStreamRenderers = _mediaStreamRenderers;

	// Search the whole document for already existing HTML video elements and observe them.
	for (i = 0, len = existingVideos.length; i < len; i++) {
		video = existingVideos.item(i);

		debug('video element found');

		observeVideo(video);
	}
}


function observeVideo(video) {
	debug('observeVideo()');

	// If the video already has a src/srcObject property but is not yet handled by the plugin
	// then handle it now.
	if ((video.src || video.srcObject) && !video._iosrtcMediaStreamRendererId) {
		handleVideo(video);
	}

	// Add .src observer to the video element.
	videoObserver.observe(video, {
		// Set to true if additions and removals of the target node's child elements (including text
		// nodes) are to be observed.
		childList: false,
		// Set to true if mutations to target's attributes are to be observed.
		attributes: true,
		// Set to true if mutations to target's data are to be observed.
		characterData: false,
		// Set to true if mutations to not just target, but also target's descendants are to be observed.
		subtree: false,
		// Set to true if attributes is set to true and target's attribute value before the mutation
		// needs to be recorded.
		attributeOldValue: false,
		// Set to true if characterData is set to true and target's data before the mutation needs to be
		// recorded.
		characterDataOldValue: false,
		// Set to an array of attribute local names (without namespace) if not all attribute mutations
		// need to be observed.
		attributeFilter: ['src', 'srcObject']
	});

	// Intercept video 'error' events if it's due to the attached MediaStream.
	video.addEventListener('error', function (event) {
		if (video.error.code === global.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && BLOB_URI_REGEX.test(video.src)) {
			debug('stopping "error" event propagation for video element');

			event.stopImmediatePropagation();
		}
	});
}

function releaseVideo(video) {
	debug('video element removed');
	// If this video element was previously handling a MediaStreamRenderer, release it.
	releaseMediaStreamRenderer(video);
	delete video._iosrtcVideoHandled;
}


/**
 * Private API.
 */

function handleVideo(video) {
	var
		xhr = new XMLHttpRequest(),
		stream;

	// The app has set video.src.
	if (video.src) {
		xhr.open('GET', video.src, true);
		xhr.responseType = 'blob';
		xhr.onload = function () {
			if (xhr.status !== 200) {
				// If this video element was previously handling a MediaStreamRenderer, release it.
				releaseMediaStreamRenderer(video);

				return;
			}

			var reader = new FileReader();

			// Some versions of Safari fail to set onloadend property, some others do not react
			// on 'loadend' event. Try everything here.
			try {
				reader.onloadend = onloadend;
			} catch (error) {
				reader.addEventListener('loadend', onloadend);
			}
			reader.readAsText(xhr.response);

			function onloadend() {
				var mediaStreamBlobId = reader.result;

				// The retrieved URL does not point to a MediaStream.
				if (!mediaStreamBlobId || typeof mediaStreamBlobId !== 'string' || !MEDIASTREAM_ID_REGEXP.test(mediaStreamBlobId)) {
					// If this video element was previously handling a MediaStreamRenderer, release it.
					releaseMediaStreamRenderer(video);

					return;
				}

				provideMediaStreamRenderer(video, mediaStreamBlobId);
			}
		};
		xhr.send();
	}

	// The app has set video.srcObject.
	else if (video.srcObject) {
		stream = video.srcObject;

		if (!stream.getBlobId()) {
			// If this video element was previously handling a MediaStreamRenderer, release it.
			releaseMediaStreamRenderer(video);

			return;
		}

		provideMediaStreamRenderer(video, stream.getBlobId());
	}
}


function provideMediaStreamRenderer(video, mediaStreamBlobId) {
	var
		mediaStream = mediaStreams[mediaStreamBlobId],
		mediaStreamRenderer = mediaStreamRenderers[video._iosrtcMediaStreamRendererId];

	if (!mediaStream) {
		releaseMediaStreamRenderer(video);

		return;
	}

	if (mediaStreamRenderer) {
		mediaStreamRenderer.render(mediaStream);
	} else {
		mediaStreamRenderer = new MediaStreamRenderer(video);
		mediaStreamRenderer.render(mediaStream);

		mediaStreamRenderers[mediaStreamRenderer.id] = mediaStreamRenderer;
		video._iosrtcMediaStreamRendererId = mediaStreamRenderer.id;
	}

	// Close the MediaStreamRenderer of this video if it emits "close" event.
	mediaStreamRenderer.addEventListener('close', function () {
		if (mediaStreamRenderers[video._iosrtcMediaStreamRendererId] !== mediaStreamRenderer) {
			return;
		}

		releaseMediaStreamRenderer(video);
	});

	// Override some <video> properties.
	// NOTE: This is a terrible hack but it works.
	Object.defineProperties(video, {
		videoWidth: {
			configurable: true,
			get: function () {
				return mediaStreamRenderer.videoWidth || 0;
			}
		},
		videoHeight: {
			configurable: true,
			get: function () {
				return mediaStreamRenderer.videoHeight || 0;
			}
		},
		readyState: {
			configurable: true,
			get: function () {
				if (mediaStreamRenderer && mediaStreamRenderer.stream && mediaStreamRenderer.stream.connected) {
					return video.HAVE_ENOUGH_DATA;
				} else {
					return video.HAVE_NOTHING;
				}
			}
		}
	});
}


function releaseMediaStreamRenderer(video) {
	if (!video._iosrtcMediaStreamRendererId) {
		return;
	}

	var mediaStreamRenderer = mediaStreamRenderers[video._iosrtcMediaStreamRendererId];

	if (mediaStreamRenderer) {
		delete mediaStreamRenderers[video._iosrtcMediaStreamRendererId];
		mediaStreamRenderer.close();
	}

	delete video._iosrtcMediaStreamRendererId;

	// Remove overrided <video> properties.
	delete video.videoWidth;
	delete video.videoHeight;
	delete video.readyState;
}
