export interface DayForecast {
  date: string;
  temperatureCelsius: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}

export interface WeatherContext {
  city: string;
  temperatureCelsius: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  dailyForecast: DayForecast[];
}
