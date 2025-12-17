import { TopicCard } from "./types";

export const DEFAULT_TOPICS: TopicCard[] = [
  {
    category: "Fruit",
    words: [
      "Apple", "Banana", "Orange", "Grape",
      "Mango", "Strawberry", "Pineapple", "Kiwi",
      "Lemon", "Cherry", "Watermelon", "Peach",
      "Pear", "Plum", "Coconut", "Lime"
    ]
  },
  {
    category: "Countries",
    words: [
      "France", "Japan", "Brazil", "Canada",
      "Egypt", "Australia", "India", "Italy",
      "China", "Mexico", "Germany", "Spain",
      "Russia", "Kenya", "Thailand", "Peru"
    ]
  },
  {
    category: "Movies",
    words: [
      "Titanic", "Avatar", "Star Wars", "Jaws",
      "Matrix", "Frozen", "Rocky", "Alien",
      "Gladiator", "Inception", "Coco", "Joker",
      "Shrek", "Grease", "Psycho", "Up"
    ]
  },
  {
    category: "Jobs",
    words: [
      "Doctor", "Teacher", "Artist", "Pilot",
      "Chef", "Lawyer", "Nurse", "Police",
      "Fireman", "Actor", "Farmer", "Writer",
      "Baker", "Judge", "Driver", "Vet"
    ]
  }
];

export const GRID_COORDS = [
  "A1", "A2", "A3", "A4",
  "B1", "B2", "B3", "B4",
  "C1", "C2", "C3", "C4",
  "D1", "D2", "D3", "D4"
];