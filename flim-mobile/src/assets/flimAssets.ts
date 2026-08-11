import type { ImageSourcePropType } from "react-native";

export const flimImages = {
  logo: require("../../assets/flim/brand/flim-logo.png") as ImageSourcePropType,
  icon: require("../../assets/flim/brand/flim-icon-512.png") as ImageSourcePropType,
  iconMark: require("../../assets/flim/brand/flim-icon-mark.png") as ImageSourcePropType,
  homeHero: require("../../assets/flim/brand/flim-hero-mobile.webp") as ImageSourcePropType,
  myPlaylistsHero: require("../../assets/flim/playlist-heroes/my-playlists-hero-mobile.webp") as ImageSourcePropType,
  publicPlaylistsHero: require("../../assets/flim/playlist-heroes/public-playlists-hero-mobile.webp") as ImageSourcePropType,
  arcadeHero: require("../../assets/flim/arcade/flim-arcade-hero-mobile.webp") as ImageSourcePropType,
  arcadeTicket: require("../../assets/flim/nav/arcade-ticket-nav.png") as ImageSourcePropType,
  classicAvatar: require("../../assets/flim/avatars/base/classic.png") as ImageSourcePropType,
  nerdAvatar: require("../../assets/flim/avatars/base/nerd.png") as ImageSourcePropType
};

export const arcadeModeIcons = {
  trivia: require("../../assets/flim/arcade/icons/movie-trivia.png") as ImageSourcePropType,
  quote: require("../../assets/flim/arcade/icons/quote-challenge.png") as ImageSourcePropType,
  poster: require("../../assets/flim/arcade/icons/poster-guess.png") as ImageSourcePropType,
  group: require("../../assets/flim/arcade/icons/group-play.png") as ImageSourcePropType,
  leaderboards: require("../../assets/flim/arcade/icons/leaderboards.png") as ImageSourcePropType,
  rewards: require("../../assets/flim/arcade/icons/rewards.png") as ImageSourcePropType
};

export const arcadeCollectionImages: Record<string, ImageSourcePropType> = {
  "time-travel": require("../../assets/flim/arcade/art/time-travel.webp") as ImageSourcePropType,
  "sci-fi": require("../../assets/flim/arcade/art/sci-fi.webp") as ImageSourcePropType,
  adventure: require("../../assets/flim/arcade/art/adventure.webp") as ImageSourcePropType,
  animation: require("../../assets/flim/arcade/art/animation.webp") as ImageSourcePropType,
  horror: require("../../assets/flim/arcade/art/horror.webp") as ImageSourcePropType,
  action: require("../../assets/flim/arcade/art/action.webp") as ImageSourcePropType,
  zombie: require("../../assets/flim/arcade/art/zombie.webp") as ImageSourcePropType,
  apocalypse: require("../../assets/flim/arcade/art/apocalypse.webp") as ImageSourcePropType,
  alien: require("../../assets/flim/arcade/art/alien.webp") as ImageSourcePropType,
  "tom-cruise": require("../../assets/flim/arcade/art/tom-cruise.webp") as ImageSourcePropType,
  fantasy: require("../../assets/flim/arcade/art/fantasy.webp") as ImageSourcePropType,
  comedy: require("../../assets/flim/arcade/art/comedy.webp") as ImageSourcePropType,
  christmas: require("../../assets/flim/arcade/art/christmas.webp") as ImageSourcePropType,
  summer: require("../../assets/flim/arcade/art/summer.webp") as ImageSourcePropType,
  anime: require("../../assets/flim/arcade/art/anime.webp") as ImageSourcePropType,
  "natural-disaster": require("../../assets/flim/arcade/art/natural-disaster.webp") as ImageSourcePropType
};
