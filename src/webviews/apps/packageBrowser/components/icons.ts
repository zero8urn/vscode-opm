import { svg } from 'lit';

/**
 * SVG icon library for the Package Browser.
 * All icons use currentColor and 16x16 viewBox for consistency.
 */

/**
 * Refresh/reload icon.
 * Used for refreshing project list and installed packages.
 */
export const refreshIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path
    d="M3 8C3 5.23858 5.23858 3 8 3C9.63527 3 11.0878 3.78495 12.0005 5H10C9.72386 5 9.5 5.22386 9.5 5.5C9.5 5.77614 9.72386 6 10 6H12.8904C12.8973 6.00014 12.9041 6.00014 12.911 6H13C13.2761 6 13.5 5.77614 13.5 5.5V2.5C13.5 2.22386 13.2761 2 13 2C12.7239 2 12.5 2.22386 12.5 2.5V4.03138C11.4009 2.78613 9.79253 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.1301 14 13.6999 11.6035 13.9756 8.54488C14.0003 8.26985 13.7975 8.0268 13.5225 8.00202C13.2474 7.97723 13.0044 8.1801 12.9796 8.45512C12.75 11.003 10.6079 13 8 13C5.23858 13 3 10.7614 3 8Z"
  />
</svg>`;

export const installIcon = svg`<svg
  viewBox="0 0 11 11"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M11 5.5C11 5.776 10.776 6 10.5 6H6V10.5C6 10.776 5.776 11 5.5 11C5.224 11 5 10.776 5 10.5V6H0.5C0.224 6 0 5.776 0 5.5C0 5.224 0.224 5 0.5 5H5V0.5C5 0.224 5.224 0 5.5 0C5.776 0 6 0.224 6 0.5V5H10.5C10.776 5 11 5.224 11 5.5Z"/>
</svg>`;

export const trashIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z"/>
</svg>`;

// Animated loading icon (16x16), uses currentColor and can be animated via CSS
export const loadingIcon = svg`<svg
  class="loading-icon"
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M13.5 8.5C13.224 8.5 13 8.276 13 8C13 5.243 10.757 3 8 3C5.243 3 3 5.243 3 8C3 8.276 2.776 8.5 2.5 8.5C2.224 8.5 2 8.276 2 8C2 4.691 4.691 2 8 2C11.309 2 14 4.691 14 8C14 8.276 13.776 8.5 13.5 8.5Z" />
</svg>`;

// Directional arrow icons (use currentColor for theming)
export const arrowDownIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M3.14645 5.64645C3.34171 5.45118 3.65829 5.45118 3.85355 5.64645L8 9.79289L12.1464 5.64645C12.3417 5.45118 12.6583 5.45118 12.8536 5.64645C13.0488 5.84171 13.0488 6.15829 12.8536 6.35355L8.35355 10.8536C8.15829 11.0488 7.84171 11.0488 7.64645 10.8536L3.14645 6.35355C2.95118 6.15829 2.95118 5.84171 3.14645 5.64645Z"/>
</svg>`;

export const arrowUpIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M3.14645 10.3536C3.34171 10.5488 3.65829 10.5488 3.85355 10.3536L8 6.20711L12.1464 10.3536C12.3417 10.5488 12.6583 10.5488 12.8536 10.3536C13.0488 10.1583 13.0488 9.84171 12.8536 9.64645L8.35355 5.14645C8.15829 4.95118 7.84171 4.95118 7.64645 5.14645L3.14645 9.64645C2.95118 9.84171 2.95118 10.1583 3.14645 10.3536Z"/>
</svg>`;

export const arrowLeftIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M10.3536 3.14645C10.5488 3.34171 10.5488 3.65829 10.3536 3.85355L6.20711 8L10.3536 12.1464C10.5488 12.3417 10.5488 12.6583 10.3536 12.8536C10.1583 13.0488 9.84171 13.0488 9.64645 12.8536L5.14645 8.35355C4.95118 8.15829 4.95118 7.84171 5.14645 7.64645L9.64645 3.14645C9.84171 2.95118 10.1583 2.95118 10.3536 3.14645Z"/>
</svg>`;

export const arrowRightIcon = svg`<svg
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
  fill="currentColor"
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
>
  <path d="M5.64645 3.14645C5.45118 3.34171 5.45118 3.65829 5.64645 3.85355L9.79289 8L5.64645 12.1464C5.45118 12.3417 5.45118 12.6583 5.64645 12.8536C5.84171 13.0488 6.15829 13.0488 6.35355 12.8536L10.8536 8.35355C11.0488 8.15829 11.0488 7.84171 10.8536 7.64645L6.35355 3.14645C6.15829 2.95118 5.84171 2.95118 5.64645 3.14645Z"/>
</svg>`;
