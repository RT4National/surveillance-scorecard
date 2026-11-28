// Portrait thumbnails: small JPEGs beside each cached portrait, for avatars in lists.
//
// Originals are about 500x767 and 69 KB; lists show them at about 40 px. The thumbnail for
// `/scorecard/portraits/NAME.jpg` (or .png, .webp) is `/scorecard/portraits/NAME.w96.jpg`, made by
// scripts/ingestion/portrait-thumbnails.mjs with macOS `sips`. The original's name carries its
// content digest, so the thumbnail name changes with it; a change to the width or quality must
// change THUMBNAIL_SUFFIX too, because portraits are served as immutable.

export const THUMBNAIL_WIDTH = 96;
/** JPEG quality passed to sips (0-100). */
export const THUMBNAIL_QUALITY = 60;
export const THUMBNAIL_SUFFIX = `.w${THUMBNAIL_WIDTH}.jpg`;

const original = /\.(jpe?g|png|webp)$/i;

export const isThumbnail = (name: string) => name.endsWith(THUMBNAIL_SUFFIX);

/** The thumbnail's file name or URL for an original portrait's file name or URL. */
export function thumbnailName(name: string): string {
  if (isThumbnail(name)) return name;
  if (!original.test(name))
    throw new Error(`Not a portrait image name: ${name}`);
  return name.replace(original, THUMBNAIL_SUFFIX);
}

/** Display size of the list avatar (styles.css, .avatar) and of the large profile portrait. */
export const avatarSize = {
  small: { width: 39, height: 43 },
  large: { width: 86, height: 94 },
} as const;
