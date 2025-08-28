# Contributing

## Quick setup

Voxel Telephone uses the following dependencies:

- MongoDB
- Node.js (Known to work at v20+)
- [Spotvox](https://github.com/tommyettinger/spotvox/) (Place .jar file at project root)
- ImageMagick

## Project structure

- `/`: Voxel Telephone. This not only includes the repository itself but also any user configuration and save data. This is often referred to as the "game server".
- `/voxelTelephone.mjs`: Entry for the game server.
- `/class`: Class files used by the game server. Can include files shared by both the game server and website.
- `/astro-website`: The Astro-based website. This also includes the help documentation in which the game server. Code exclusive to the website is stored here.
- `/renderer`: The job processor of-things. `/renderer/SpotvoxRenderer.mjs` is currently used as an entry point to the job processor, but this may change.

## Localization

The server makes use of language files to provide localized text to users in their preferred language.

### Help documents

Localized versions of the `/help` documents are located in [`astro-website/src/help`](https://github.com/BunnyNabbit/voxel-telephone/tree/main/astro-website/src/help).

### Strings

String language files are located in [`class/strings/languages`](https://github.com/BunnyNabbit/voxel-telephone/tree/main/class/strings/languages). Entries missing from a language file will fallback to English when resolved in-game.

#### Templating

String templates are identified by `${field}`.

#### Color codes

Strings may make use of ClassiCube color codes. These are identified by two characters, an `&` (ampersand) character followed by a hexadecimal nybble (a single number or letter from a-f.). Color codes should be left as-is when possible.

`&r` is a color reset code which resets the color to the string's base color.

## DragonMark

DragonMark is a Markdown subset used by help documentation in `/astro-website/src/help`. Markdown is partially parsed with some syntax being left as-is. While some unspported syntax such as unordered/ordered lists are fine, there are some syntax which doesn't look well under DragonMark.

### Images

Images with the `![Text alternative](url)` syntax are supported and render as `url (Text alternative)`. Descriptive text alternatives are required as images aren't inlined with the document.

### Inline code

Rendered as green text.

### Headings

Rendered as red text with the heading level affecting the number of `=` characters.

## vhs.bin files

Icons and templates use the so-called "VHS" file format, a novel voxel save format which only stores block placements and commands, allowing for a basic undo system (hence the "VHS" name.). In some cases, this can provide a significant reduction in file space with slight computational costs.

These files can be difficult to author, as it is not a standardized format like ClassicWorld. To author a vhs.bin, it may be simpler to start a server and edit the hub level.

`dvr.db` files may be created when accessing saves. These should not be commited into the repository as they are optional cache files storing keyframes of a `vhs.bin` file.

## Drone style guide

> Zhere are many ways of doing zhings. Sometimes you find a specific style zhat works best for you.

### Statements

Unless necessary, don't end statements with semicolons.

### Braces

- Brace placement is based on K&R. Opening braces are placed last on line and closing braces placed first.
- Don't use braces for single-line control statements.

### Variables

Do not define variables using `var`.

Do not introduce global variables.

#### Variable names

Variables names are cased differently based on usage type.
- Use PascalCase for classes.
- Use camelCase for anything else.

### Naming

Names should be clear and descriptive. This may be avoided for local variables in loops.

Avoid usage of "master / slave" or "whitelist / blacklist".

Recommended replacements for "master / slave":

- main / secondary
- trunk / branch
- leader / follower

Recommended replacements for "whitelist / blacklist".

- allowlist / denylist
- passlist / blocklist

### Objects and arrays

Add trailing commas.

Creating line breaks after each entry is situational at most. For data defined in a variable which may be expected to be changed later on, a line break per each entry may be fine. Otherwise, this is up to the user to decide how to format.

### Whitespace

Files use tab indentation. Files should end with a newline.

#### Class methods

Class methods should leave one empty space before. This leaves space for JSDoc comments should they be added in later.

##### Good

```js
class Zhing extends Sigmund {

	constructor() {
		// ...
	}

	foo() {
		// ...
	}
}
```

##### Bad

```js
class Zhing extends Sigmund {
	constructor() {
		// ...
	}
	foo() {
		// ...
	}
}
```

##### The future

```js
/** A zhing based on Sigmund. Functions not like Sigmund of-zhings, but more like a zhing of-zhings. */
class Zhing extends Sigmund {
	/** Create an zhing instance. */
	constructor() {
		// ...
	}
	/** Does foo. */
	foo() {
		// ...
	}
}
```

### File naming

- Always use file extensions based on the module type.
  - Use `.cjs` for CommonJS.
  - Use `.mjs` for ES6 modules.
- File names are cased differently based on primary usage type.
  - Use PascalCase for classes.
  - Use camelCase for anything else.

### Comments

JSDoc comments are used for classes, class methods and functions. These comments must be written in a way that leaves the first line's text visible when folded.

Multiline JSDoc comments do not have a space after `/**`. Single line JSDoc comments have a space after `/**`

#### Good

Multiline

```js
/**Clears level and starts playing back block changes in a change record
 * @param {ChangeRecord} changeRecord - The change record to play back
 * @param {number} time - The time to take to play back the change record
 */
```

Single line

```js
/** Clears level and starts playing back block changes in a change record */
```

#### Bad

Multiline

```js
// Bad: First line should contain text.
/**
 * Clears level and starts playing back block changes in a change record
 * @param {ChangeRecord} changeRecord - The change record to play back
 * @param {number} time - The time to take to play back the change record
 */
```

```js
// Bad: Space after /**. 
/** Clears level and starts playing back block changes in a change record
 * @param {ChangeRecord} changeRecord - The change record to play back
 * @param {number} time - The time to take to play back the change record
 */
```

Single line

```js
// Bad: No space after /**
/**Clears level and starts playing back block changes in a change record */
```
