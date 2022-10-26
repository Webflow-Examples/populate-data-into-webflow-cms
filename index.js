// import neccessary packages
import axios from "axios";
import Webflow from "webflow-api";
import Bottleneck from "bottleneck";
import getYear from "date-fns/getYear/index.js";
import { parseISO } from "date-fns";
import * as dotenv from "dotenv";
dotenv.config();

// set up api task scheduler to respect Webflow api rate limit of 120
const limiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1000,
});

// variable containing the id of the genre and collection id from Webflow which we'll use to add our referenced collection items
const allMovieGenres = [
  { id: "28", name: "Action", itemId: "6350c466177fc03ab366dbde" },
  { id: 12, name: "Adventure", itemId: "6350c466fc61527feb98ed8d" },
  { id: 16, name: "Animation", itemId: "6350c4669fddb42553273d22" },
  { id: 35, name: "Comedy", itemId: "6350c46611c67034a8dd3950" },
  { id: 80, name: "Crime", itemId: "6350c46672526eaf9a608e0f" },
  { id: 99, name: "Documentary", itemId: "6350c46646bb1dba9bac4506" },
  { id: 18, name: "Drama", itemId: "6350c4663aebc3d9ab68b239" },
  { id: 10751, name: "Family", itemId: "6350c466b8b704cc5e00bba4" },
  { id: 14, name: "Fantasy", itemId: "6350c467716c1349cd979ea5" },
  { id: 36, name: "History", itemId: "6350c466e48b907aae3dc343" },
  { id: 27, name: "Horror", itemId: "6350c4661f96af44035b5d8b" },
  { id: 10402, name: "Music", itemId: "6350c466cc865494f30b2562" },
  { id: 9648, name: "Mystery", itemId: "6350c4662be0acf3c39fcfe1" },
  { id: 10749, name: "Romance", itemId: "6350c466e3858126836a733c" },
  { id: 878, name: "Science Fiction", itemId: "6350c466227c9381e733fc5f" },
  { id: 10770, name: "TV Movie", itemId: "6350c466c1cf132f292a862e" },
  { id: 53, name: "Thriller", itemId: "6350c466968264447a173718" },
  { id: 10752, name: "War", itemId: "6350c466227c9320d433fc60" },
  { id: 37, name: "Western", itemId: "6350c46672526e68ea608e10" },
];

// max page count of the movies api
const MAX_PAGE_COUNT = 401;

// create connection to the Webflow api using our Webflow api token
const webflowApi = new Webflow({ token: process.env.WF_API_KEY });

// set up axios to make requets to the movies api
const movieApi = axios.create({
  baseURL: "https://api.themoviedb.org/3/",
  params: {
    api_key: process.env.MOVIE_API_KEY,
  },
});

// some constants for images related to the movies api
const MOVIE_IMAGE_PATH = "https://image.tmdb.org/t/p/w300";
const MOVIE_BACKDROP_PATH = "https://image.tmdb.org/t/p/original";

// instantiate the function to retireve movies
fetchMovies();

// function definition for getting movies
async function fetchMovies() {
  let activePage = 1;

  // iterate activePage until we reach the max page count set — 401
  // using the Bottleneck task scheduler, make api call to Webflow to create a collection item for each movie retrieved
  while (activePage < MAX_PAGE_COUNT) {
    // some options we're passing to the movies endpoint
    const options = { params: { page: activePage } };
    // the movies endpoint we're hitting
    const { data } = await movieApi.get("discover/movie", options);
    // data.results contains an array of objects where each object is a movie
    data.results.forEach(
      async (movie) => await limiter.schedule(() => createMovie(movie))
    );
    activePage++;
  }
}

// function to call the Webflow api to create each movie
async function createMovie(movie) {
  if (!movie.poster_path || !movie.backdrop_path) return;

  // find the trailer for the movie, if no trailer, don't add movie to Webflow
  const trailer = await findTrailer(movie);
  if (!trailer || !trailer.key) return;
  movie.trailerKey = trailer.key;

  let genres = [];

  // add the relevant Webflow genre collection id for our multi reference field
  movie.genre_ids.forEach((genreId) => {
    const matchedGenre = allMovieGenres.find((genre) => genre.id === genreId);
    if (matchedGenre) genres.push(matchedGenre.itemId);
  });

  // make the call to Webflow to add the movie
  return webflowApi
    .createItem({
      collectionId: "6353176f2cf2501b7755dae3",
      fields: {
        name: movie.title,
        "movie-id": movie.id,
        genres,
        "movie-backdrop-poster": MOVIE_BACKDROP_PATH + movie.backdrop_path,
        "movie-poster": MOVIE_IMAGE_PATH + movie.poster_path,
        "release-date": movie.release_date,
        "release-year": getYear(parseISO(movie.release_date), 1),
        overview: movie.overview,
        "vote-average": movie.vote_average,
        "vote-count": movie.vote_count,
        popularity: movie.popularity,
        trailer: "https://www.youtube.com/watch?v=" + movie.trailerKey,
        _archived: false,
        _draft: false,
      },
    })
    .then((res) => console.log(res.name))
    .catch((err) => console.log(err));
}

// function to check if a movie has a trailer
async function findTrailer(movie) {
  const trailerOptions = { params: { append_to_response: "videos" } };
  const { data } = await movieApi.get(`movie/${movie.id}`, trailerOptions);
  return await data.videos.results.find((vid) => vid.type === "Trailer");
}

// a function we ran separately to initially add the movie genres to Webflow
async function fetchGenres() {
  const { data } = await movieApi.get("/genre/movie/list");

  data.genres.forEach((movie) => {
    webflowApi.createItem({
      collectionId: "6348398efba7fae203374c15",
      fields: {
        name: movie.name,
        _archived: false,
        _draft: true,
      },
    });
  });
}
