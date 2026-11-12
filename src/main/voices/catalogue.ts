// The Voices Settings offers, downloaded from sherpa-onnx's model releases
// (https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models). Sizes and
// sha256 digests are the release assets'; each archive holds one folder.
// Piper voices' data licences are from their MODEL_CARD (rhasspy/piper-voices);
// only voices free for any use are listed. Their espeak-ng voice is the one
// the model was trained with (`espeak.voice` in its .onnx.json).

export interface CatalogueVoice {
  /** `<engine>/<name>`, as `<meta name="margen-voice">` holds it. */
  id: string
  name: string
  language: string
  /** The speaker id within the model. */
  speaker: number
  /** The espeak-ng voice the text is phonemized with. */
  espeak: string
  /** What the preview says, in the Voice's language. */
  sample: string
}

export interface VoicePackEntry {
  id: string
  name: string
  engine: 'kokoro' | 'piper'
  licence: string
  url: string
  size: number
  sha256: string
  /** The folder the archive unpacks to. */
  folder: string
  /** Within `folder`. `voices` is Kokoro's speaker embeddings. */
  files: { model: string; tokens: string; voices?: string }
  voices: CatalogueVoice[]
}

const RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models'

const SAMPLES = {
  en: 'This is how I sound when I narrate your video.',
  no: 'Slik høres jeg ut når jeg forteller i videoen din.',
  da: 'Sådan lyder jeg, når jeg fortæller i din video.',
  sv: 'Så här låter jeg när jag berättar i din video.',
  de: 'So klinge ich, wenn ich dein Video spreche.',
  fr: 'Voici ma voix quand je raconte ta vidéo.',
  es: 'Así sueno cuando narro tu vídeo.',
}

/** Kokoro-82M v1.0, int8. Speaker ids from https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html */
const kokoro: VoicePackEntry = {
  id: 'kokoro-int8-multi-lang-v1_0',
  name: 'Kokoro-82M',
  engine: 'kokoro',
  licence: 'Apache-2.0',
  url: `${RELEASES}/kokoro-int8-multi-lang-v1_0.tar.bz2`,
  size: 132353410,
  sha256: '72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653',
  folder: 'kokoro-int8-multi-lang-v1_0',
  files: { model: 'model.int8.onnx', tokens: 'tokens.txt', voices: 'voices.bin' },
  voices: [
    { id: 'kokoro/af_heart', name: 'Heart', language: 'English (US)', speaker: 3, espeak: 'en-us', sample: SAMPLES.en },
    { id: 'kokoro/af_bella', name: 'Bella', language: 'English (US)', speaker: 2, espeak: 'en-us', sample: SAMPLES.en },
    { id: 'kokoro/am_michael', name: 'Michael', language: 'English (US)', speaker: 16, espeak: 'en-us', sample: SAMPLES.en },
    { id: 'kokoro/bf_emma', name: 'Emma', language: 'English (UK)', speaker: 21, espeak: 'en-gb', sample: SAMPLES.en },
    { id: 'kokoro/bm_george', name: 'George', language: 'English (UK)', speaker: 26, espeak: 'en-gb', sample: SAMPLES.en },
  ],
}

/** A single-speaker Piper voice, `vits-piper-<name>.tar.bz2`. */
function piper(
  name: string,
  speaker: string,
  language: string,
  espeak: string,
  sample: string,
  dataLicence: string,
  size: number,
  sha256: string,
): VoicePackEntry {
  return {
    id: `piper-${name}`,
    name: `${speaker}, ${language}`,
    engine: 'piper',
    licence: `MIT engine · ${dataLicence} voice`,
    url: `${RELEASES}/vits-piper-${name}.tar.bz2`,
    size,
    sha256,
    folder: `vits-piper-${name}`,
    files: { model: `${name}.onnx`, tokens: 'tokens.txt' },
    voices: [{ id: `piper/${name}`, name: speaker, language, speaker: 0, espeak, sample }],
  }
}

export const VOICE_CATALOGUE: VoicePackEntry[] = [
  kokoro,
  piper('en_US-kristin-medium', 'Kristin', 'English (US)', 'en', SAMPLES.en, 'public domain', 67259230, 'c2206f572df2956c50b1ae3367eebce3853c663e890cba8048cd62b1e4dbe6c7'),
  piper('en_US-norman-medium', 'Norman', 'English (US)', 'en', SAMPLES.en, 'public domain', 67203672, '1f32065d480abe9abc7c7f91442125d0b34c1cc065d1e600466cac408eabf3b8'),
  piper('en_GB-cori-medium', 'Cori', 'English (UK)', 'en-gb-x-rp', SAMPLES.en, 'CC BY 4.0', 67257412, '49c9a5361bbdd95d7ca9687c4de11e5908481f65e7c7c368960df79949fdac2b'),
  piper('en_GB-alba-medium', 'Alba', 'English (UK)', 'en-gb-x-rp', SAMPLES.en, 'CC BY 4.0', 67212349, 'fcd45962906933eec4431d3688f7d74aaac8713c87c6717f91fd3b23463aa1a1'),
  piper('no_NO-talesyntese-medium', 'Talesyntese', 'Norwegian', 'nb', SAMPLES.no, 'CC0', 67194829, 'dcb7c36b7222e290cca1fd4cdecb474e7fd651dc5b0d3d42c33d416a8e62018b'),
  piper('da_DK-talesyntese-medium', 'Talesyntese', 'Danish', 'da', SAMPLES.da, 'CC0', 67185257, 'f2e2cbcdb2b21e76f93635b35105d07b37997ace434d7289d04b689a97c19bd0'),
  piper('sv_SE-nst-medium', 'NST', 'Swedish', 'sv', SAMPLES.sv, 'CC0', 67144884, '5aed0f5ab75135fc3ba6a4f3567e171d72df753305b08a01ca42f79411587f67'),
  piper('de_DE-thorsten-medium', 'Thorsten', 'German', 'de', SAMPLES.de, 'CC0', 67214254, '50487d9c95fdf2191f31d2588569381063ba1591dcd4c7d4bdd30f12b2191714'),
  piper('fr_FR-siwis-medium', 'Siwis', 'French', 'fr', SAMPLES.fr, 'CC BY 4.0', 67207459, '375909aa30842b3a4efa10b1beb1d761af792960ae6873b4d53889f96c66195b'),
  piper('es_ES-davefx-medium', 'Davefx', 'Spanish', 'es', SAMPLES.es, 'CC0', 67184952, 'a3f6beb54a9cb893279f72978a22f807a4d9fc9c7848157b524d5cc7b7f58b22'),
]
