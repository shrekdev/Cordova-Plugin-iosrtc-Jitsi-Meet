/**
 * Variables.
 */

var
	// Dictionary of MediaStreamRenderers.
	// - key: MediaStreamRenderer id.
	// - value: MediaStreamRenderer.
	mediaStreamRenderers = {},

	// Dictionary of MediaStreams.
	// - key: MediaStream blobId.
	// - value: MediaStream.
	mediaStreams = {},


/**
 * Dependencies.
 */
	debug                  = require('debug')('iosrtc'),
	exec                   = require('cordova/exec'),
	domready               = require('domready'),

	getUserMedia           = require('./getUserMedia'),
	enumerateDevices       = require('./enumerateDevices'),
	RTCPeerConnection      = require('./RTCPeerConnection'),
	RTCSessionDescription  = require('./RTCSessionDescription'),
	RTCIceCandidate        = require('./RTCIceCandidate'),
	MediaStream            = require('./MediaStream'),
	MediaStreamTrack       = require('./MediaStreamTrack'),
	videoElementsHandler   = require('./videoElementsHandler');


/**
 * Expose the iosrtc object.
 */
module.exports = {
	// Expose WebRTC classes and functions.
	getUserMedia:          getUserMedia,
	enumerateDevices:      enumerateDevices,
	getMediaDevices:       enumerateDevices,  // TMP
	RTCPeerConnection:     RTCPeerConnection,
	RTCSessionDescription: RTCSessionDescription,
	RTCIceCandidate:       RTCIceCandidate,
	MediaStream:           MediaStream,
	MediaStreamTrack:      MediaStreamTrack,

	// Expose a function to refresh current videos rendering a MediaStream.
	refreshVideos:         refreshVideos,

	// Expose a function to handle a video not yet inserted in the DOM.
	observeVideo:          videoElementsHandler.observeVideo,

	releaseVideo: videoElementsHandler.releaseVideo,

	// Select audio output (earpiece or speaker).
	selectAudioOutput:     selectAudioOutput,

	// turnOnSpeaker with options
	turnOnSpeaker: turnOnSpeaker,

	// Checking permision (audio and camera)
	requestPermission: requestPermission,

	// Expose a function to pollute window and naigator namespaces.
	registerGlobals:       registerGlobals,

	// Expose the debug module.
	debug:                 require('debug'),

	// Debug function to see what happens internally.
	dump:                  dump
};


domready(function () {
	// Let the MediaStream class and the videoElementsHandler share same MediaStreams container.
	MediaStream.setMediaStreams(mediaStreams);
	videoElementsHandler(mediaStreams, mediaStreamRenderers);
});


function refreshVideos() {
	debug('refreshVideos()');

	var id;

	for (id in mediaStreamRenderers) {
		if (mediaStreamRenderers.hasOwnProperty(id)) {
			mediaStreamRenderers[id].refresh();
		}
	}
}

function selectAudioOutput(output) {
	debug('selectAudioOutput() | [output:"%s"]', output);

	switch (output) {
		case 'earpiece':
			exec(null, null, 'iosrtcPlugin', 'selectAudioOutputEarpiece', []);
			break;
		case 'speaker':
			exec(null, null, 'iosrtcPlugin', 'selectAudioOutputSpeaker', []);
			break;
		default:
			throw new Error('output must be "earpiece" or "speaker"');
	}
}

function turnOnSpeaker(isTurnOn, needRecord) {
	debug('turnOnSpeaker() | [isTurnOn:"%s", needRecord:"%s"]', isTurnOn, needRecord);

	exec(null, null, 'iosrtcPlugin', "RTCTurnOnSpeaker", [isTurnOn, needRecord]);
}

function requestPermission(needMic, needCamera, callback) {
	debug('turnOnSpeaker() | [isTurnOn:"%s", needRecord:"%s"]', needMic, needCamera);

	function ok() {
		callback(true);
	}

	function error() {
		callback(false);
	}
	exec(ok, error, 'iosrtcPlugin', "RTCRequestPermission", [needMic, needCamera]);
}

function registerGlobals() {
	debug('registerGlobals()');

	if (!global.navigator) {
		global.navigator = {};
	}

	if (!navigator.mediaDevices) {
		navigator.mediaDevices = {};
	}

	navigator.getUserMedia                  = getUserMedia;
	navigator.webkitGetUserMedia            = getUserMedia;
	navigator.mediaDevices.getUserMedia     = getUserMedia;
	navigator.mediaDevices.enumerateDevices = enumerateDevices;
	window.RTCPeerConnection                = RTCPeerConnection;
	window.webkitRTCPeerConnection          = RTCPeerConnection;
	window.RTCSessionDescription            = RTCSessionDescription;
	window.RTCIceCandidate                  = RTCIceCandidate;
	window.MediaStream                      = MediaStream;
	window.webkitMediaStream                = MediaStream;
	window.MediaStreamTrack                 = MediaStreamTrack;
}


function dump() {
	exec(null, null, 'iosrtcPlugin', 'dump', []);
}
