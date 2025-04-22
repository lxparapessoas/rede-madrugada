# Análise da oferta de Transporte Público na AML em cada hora

Este script tem como objetivo a análise da oferta dos operadores de
transporte público da AML com base na sua oferta planeada e divulgada
através dos respetivos ficheiros GTFS.

> A sua execução só é possível após a criação da pasta `resources` com
> os respetivos ficheiros GTFS dos operadores.

## Processamento dos GTFS

    library(tidytransit)
    library(sf)
    library(dplyr)
    library(GTFSwizard)
    library(stplanr)
    library(mapview)

### Parâmetros

    OPERATORS <- c("Carris", "CarrisMetropolitana", "MetroLisboa", "MobiCascais", "MTS", "TCB", "CP", "Fertagus", "TTSL")
    DATES <- c("2025-04-02","2025-04-05")
    HOURS <- c(20:23, 0:8)

    FOLDER_GTFS_SOURCE <-"resources"
    FOLDER_OUTPUT <- "output"

    PARISHES = st_read(sprintf("%s/FreguesiasAML.gpkg", FOLDER_GTFS_SOURCE), layer = "aggregated")
    PARISHES <- st_transform(PARISHES, csr="CRS:84")
    # mapview() + mapview(PARISHES["Freguesia"], legend=FALSE)

### Métodos auxiliares

    # Function to adjust GTFS times that pass 24:00 (https://gtfs.org/documentation/schedule/reference/#stop_timestxt)
    library(hms)  # Ensure hms package is loaded
    convert_gtfs_times <- function(time_col) {
      time_col <- as.numeric(time_col)  # Convert hms to numeric (seconds)
      
      # Adjust times greater than or equal to 24 hours
      time_col <- ifelse(time_col >= 24 * 3600, time_col - 24 * 3600, time_col)
      
      as_hms(time_col)  # Convert back to hms
    }

    # Helpers to summarise with mixed data types
    summarise_text_unique <- function(x) {
      if (all(sapply(x, is.numeric))) return (NA)
      # print(sprintf("> Sumarise text %d: %s", length(x), paste(x, collapse=",")))
      return(paste(unique(x), collapse=", "))
    }
    summarise_number_sum <- function(x) {
      if (all(sapply(x, is.numeric))) return (sum(x))
      return(NA)
    }

### Processamento

#### Operação horária por operador

    # Loop processing
    for (o in OPERATORS) {
      print(sprintf("OPERATOR %s...", o))
      gtfs_src = sprintf("%s/%s.zip", FOLDER_GTFS_SOURCE, o)
      gtfs = tidytransit::read_gtfs(gtfs_src)
      
      print("Converting stop_times to make sure they don't pass 24:00...")
      gtfs$stop_times <- gtfs$stop_times %>%
        mutate(
          arrival_time = convert_gtfs_times(arrival_time),
          departure_time = convert_gtfs_times(departure_time)
        )
      print("Done!")
      
      if (length(gtfs$shapes$shape_id) == 0) {
        warning("GTFS has no shapes file, generating it...")
        gtfs_w = GTFSwizard::read_gtfs(gtfs_src)
        gtfs$shapes = gtfs_w$shapes
        print(sprintf("> Merging trips to add new shapes id (%d rows)", nrow(gtfs$trips)))
        gtfs$trips <- left_join(gtfs$trips, gtfs_w$trips[, c("trip_id", "shape_id")], by = "trip_id", suffix=c("_old", ""))
        print(sprintf("> Merged: %d rows", nrow(gtfs$trips)))
        print("Done!")
      }
      
      for (d in DATES) {
        print(sprintf("DAY %s...", d))
        
        for (h in HOURS) {
          h_start = sprintf("%02d:00:00", h)
          h_end = sprintf("%02d:59:59", h)
          
          print("-----------------------")
          print(sprintf("Analysing GTFS for hour %02d (%s, %s)...", h, h_start, h_end))
          print("---")
          
          # Filter by hour
          gtfs_hour = NULL
          tryCatch(
            gtfs_hour <<- tidytransit::filter_feed_by_date(gtfs, d, h_start, h_end), # <<- to change the variable in the upper scope
            error = function(e) warning("\nNO SERVICES FOR THIS HOUR!")
          )
          if (is.null(gtfs_hour)) next
          
          print(sprintf("Filtered %d stops, %d routes and %d stop times", nrow(gtfs_hour$stops), nrow(gtfs_hour$routes), nrow(gtfs_hour$stop_times)))
          
          # Perform aggregated analysis
          route_frequency = tidytransit::get_route_frequency(gtfs_hour, h_start, h_end, service_ids = gtfs_hour$calendar$service_id)

          # Prepare GeoJSON
          gtfs_sf <- tidytransit::gtfs_as_sf(gtfs_hour)

          # Extend GTFS with contextual information and aggregated analysis results
          # > Merge with trips.txt to associate shape_id and route_id
          print(sprintf("> Merging shapes with aggregated analysis (%d rows)", nrow(gtfs_sf$shapes)))
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, gtfs_sf$trips[, c("shape_id", "route_id")], by = "shape_id", multiple="first")
          print(sprintf("> Merged: %d rows", nrow(gtfs_sf$shapes)))
          # > Merge with routes.txt to get route_name
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, gtfs_sf$routes[, c("route_id", "route_short_name", "route_long_name")], by = "route_id")
          print(sprintf("> Merged: %d rows", nrow(gtfs_sf$shapes)))
          # > Finaly, merge with aggregated frequency analysis
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, route_frequency, by = "route_id")
          print(sprintf("> Merged: %d rows", nrow(gtfs_sf$shapes)))
          
          # Compute indicators based on aggregated analysis
          gtfs_sf$shapes$services = 60 / (gtfs_sf$shapes$mean_headways/60)

          # > Aggregate overlapping shape segments
          shapes_aggregated <- stplanr::overline2(
            gtfs_sf$shapes,  
            c("services", "total_departures", "route_short_name"),
            fun=list(sum=summarise_number_sum, unique=summarise_text_unique)
          )
        
          # Write files
          folder = sprintf("%s/%s/GeoJSON", FOLDER_OUTPUT, d)
          ifelse(!dir.exists(folder), dir.create(folder, recursive=TRUE), FALSE)
          st_write(gtfs_sf$shapes,sprintf("%s/%s_%02d00_shapes.geojson", folder, o, h), append = FALSE)
          st_write(shapes_aggregated,sprintf("%s/%s_%02d00_shapes_aggregated.geojson", folder, o, h), append = FALSE)
        }
      }
    }

#### Operação horária por freguesia

    library(purrr)
    library(tidyr)  


    for (d in DATES) {
        print(sprintf("DAY %s...", d))
      
        for (h in HOURS) {
          print("-----------------------")
          print(sprintf("Aggregating shapes for hour %02d...", h))
          print("---")
          
          # Read all geojsons for that hour 
          folder = sprintf("%s/%s/GeoJSON", FOLDER_OUTPUT, d)
          line_files <- list.files(folder, pattern = sprintf("\\_%02d00_shapes.geojson$", h), full.names = TRUE)
        
          if (length(line_files)==0) {
            warning(sprintf("> No files for hour %d", h))
            next
          }
          
          lines <- map_dfr(line_files, function(file) {
            operator <- sub(".*/([^/_]+)_.*", "\\1", file)
            df <- st_read(file, quiet = TRUE)
            # Coerce to numeric (you can also choose character instead if that makes more sense)
            df$st_dev_headways <- as.numeric(df$st_dev_headways)
            df$route_short_name_plus = ifelse(operator == df$route_short_name, df$route_short_name, paste0(operator, " ", df$route_short_name))
            df
          })
          lines <- st_transform(lines, st_crs(PARISHES))
          
          # Spatial join – find lines intersecting each polygon
          joined <- st_join(lines, PARISHES, join = st_intersects, left = FALSE)
          summary_table <- joined %>%
            group_by(Dicofre) %>%
            summarise(
              services = summarise_number_sum(services),
              lines=summarise_text_unique(route_short_name_plus)
            )
          summary_table_clean <- summary_table %>%
            st_drop_geometry() 
          result <- PARISHES %>%
            left_join(summary_table_clean, by = "Dicofre") %>%
            mutate(
              services = replace_na(services, 0)
            )
          folder = sprintf("%s/%s/GeoJSONParish", FOLDER_OUTPUT, d)
          ifelse(!dir.exists(folder), dir.create(folder, recursive=TRUE), FALSE)
          result_reprojected <- st_transform(result, crs=4386)
          st_write(result_reprojected,sprintf("%s/%02d00.geojson", folder, h), append = FALSE)
      }
    }

## Extra

### Filtrar GTFS CP para Urbanos Lisboa

Este método permite gerar um GTFS para os comboios urbanos de Lisboa da
CP, a partir do GTFS para a oferta nacional disponibilizado pela
empresa.

    gtfs_cp = tidytransit::read_gtfs("resources/CP_Original.zip")

    # Option 1
    railways_lisbon = c(
      "Linha da Azambuja", "Linha de Sintra", "Linha do Sado", "Linha de Cascais" 
    )
    routes_lisbon = gtfs_cp$routes %>%
      filter(route_short_name %in% railways_lisbon)

    # Option 2
    stations_lisbon = c(
      "94_61101", # Sintra
      "94_62042", # Meleças
      "94_59006", # Rossio
      "94_31039", # Lisboa Oriente
      "94_33001", # Azambuja
      "94_30007", # Lisboa SA
      "94_31310", # Castanheira Ribatejo
      "94_67025", # Alcântara-terra
      "94_69260", # Cascais
      "94_69179", # Oeiras
      "94_69005", # Cais do Sodré
      "94_95000", # Barreiro
      "94_91058" # Praias do Sado A
    )
    routes_lisbon = gtfs_cp$routes %>%
      filter(grepl(paste(stations_lisbon, collapse = "|"), route_id) & (route_short_name == "U" | grepl("^Linha", route_short_name)))

    # Filter GTFS by routes 
    trips_lisbon = gtfs_cp$trips %>%
      filter(route_id %in% routes_lisbon$route_id)

    gtfs_cp_lisbon = tidytransit::filter_feed_by_trips(gtfs_cp, trip_ids = trips_lisbon$trip_id) 

    tidytransit::write_gtfs(gtfs_cp_lisbon, "resources/CP.zip")
