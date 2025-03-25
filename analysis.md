# Análise da oferta de Transporte Público na AML em cada hora

Este script tem como objetivo a análise da oferta dos operadores de
transporte público da AML com base na sua oferta planeada e divulgada
através dos respetivos ficheiros GTFS.

> A sua execução só é possível após a criação da pasta `resources` com
> os respetivos ficheiros GTFS dos operadores.

## Processamento dos GTFS

### Parâmetros

    OPERATORS <- c("Carris", "CarrisMetropolitana", "MetroLisboa", "MobiCascais", "MTS", "TCB", "CP", "Fertagus", "TTSL")
    DATES <- c("2025-03-26")
    HOURS <- 0:8

    FOLDER_GTFS_SOURCE <-"resources"
    FOLDER_OUTPUT <- "output"

### Métodos auxiliares

    # Function to adjust GTFS times that pass 24:00 (https://gtfs.org/documentation/schedule/reference/#stop_timestxt)
    library(hms)  # Ensure hms package is loaded
    convert_gtfs_times <- function(time_col) {
      time_col <- as.numeric(time_col)  # Convert hms to numeric (seconds)
      
      # Adjust times greater than or equal to 24 hours
      time_col <- ifelse(time_col >= 24 * 3600, time_col - 24 * 3600, time_col)
      
      as_hms(time_col)  # Convert back to hms
    }

### Processamento

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
        print(sprintf("> Merging trips to add new shapes id (%d rows)", length(gtfs$trips$trip_id)))
        gtfs$trips <- left_join(gtfs$trips, gtfs_w$trips[, c("trip_id", "shape_id")], by = "trip_id", suffix=c("_old", ""))
        print(sprintf("> Merged: %d rows", length(gtfs$trips$trip_id)))
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
          
          print(sprintf("Filtered %d stops, %d routes and %d stop times", length(gtfs_hour$stops$stop_id), length(gtfs_hour$routes$route_id), length(gtfs_hour$stop_times$trip_id)))
          
          # Write GTFS file
          folder = sprintf("%s/%s/GTFS", FOLDER_OUTPUT, d)
          ifelse(!dir.exists(folder), dir.create(folder, recursive=TRUE), FALSE)
          tidytransit::write_gtfs(gtfs_hour, sprintf("%s/%s_%02d00.zip", folder, o, h))
          
          # Perform aggregated analysis
          stop_frequency = tidytransit::get_stop_frequency(gtfs_hour, h_start, h_end, by_route=FALSE)
          route_frequency = tidytransit::get_route_frequency(gtfs_hour, h_start, h_end)
          
          # Prepare GeoJSON
          gtfs_sf <- tidytransit::gtfs_as_sf(gtfs_hour)
          
          # Extend GTFS with aggregated analysis results
          print(sprintf("> Merging stops with aggregated analysis (%d rows)", length(gtfs_sf$stops$stop_id)))
          gtfs_sf$stops <- left_join(gtfs_sf$stops, stop_frequency, by = "stop_id")
          print(sprintf("> Merged: %d rows", length(gtfs_sf$stops$stop_id)))
          
          print(sprintf("> Merging shapes with aggregated analysis (%d rows)", length(gtfs_sf$shapes$shape_id)))
          trips_unique <- gtfs_sf$trips %>%
            group_by(shape_id) %>%
            slice(1) %>%
            ungroup()
          
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, trips_unique[, c("shape_id", "route_id")], by = "shape_id")
          print(sprintf("> Merged: %d rows", length(gtfs_sf$shapes$shape_id)))
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, gtfs_sf$routes[, c("route_id", "route_short_name", "route_long_name")], by = "route_id")
          print(sprintf("> Merged: %d rows", length(gtfs_sf$shapes$shape_id)))
          gtfs_sf$shapes <- left_join(gtfs_sf$shapes, route_frequency, by = "route_id")
          print(sprintf("> Merged: %d rows", length(gtfs_sf$shapes$shape_id)))
          
          # Compute indicators based on aggregated analysis
          gtfs_sf$shapes$services = 60 / (gtfs_sf$shapes$mean_headways/60)
          gtfs_sf$stops$services = 60 / (gtfs_sf$stops$mean_headway/60)

          # > Simplify shapes, reduce detail for smaller file size
          gtfs_sf$shapes$geometry <- sf::st_simplify(gtfs_sf$shapes$geometry, dTolerance = 0.00005)  
          gtfs_sf$shapes$geometry <- sf::st_zm(gtfs_sf$shapes$geometry, drop = TRUE, what = "ZM")
          
          # > Simplify stops, to reduce file size
          gtfs_sf$stops <- gtfs_sf$stops[, c("stop_id", "stop_name", "n_departures", "mean_headway")] 
          
          # Write files
          folder = sprintf("%s/%s/GeoJSON", FOLDER_OUTPUT, d)
          ifelse(!dir.exists(folder), dir.create(folder, recursive=TRUE), FALSE)
          st_write(gtfs_sf$stops,sprintf("%s/%s_%02d00_stops.geojson", folder, o, h), append = FALSE)
          st_write(gtfs_sf$shapes,sprintf("%s/%s_%02d00_shapes.geojson", folder, o, h), append = FALSE)
        }
      }
    }

    ## [1] "OPERATOR Carris..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 1428 stops, 46 routes and 4167 stop times"
    ## [1] "> Merging stops with aggregated analysis (1428 rows)"
    ## [1] "> Merged: 1428 rows"
    ## [1] "> Merging shapes with aggregated analysis (86 rows)"
    ## [1] "> Merged: 86 rows"
    ## [1] "> Merged: 86 rows"
    ## [1] "> Merged: 86 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `Carris_0000_stops' failed
    ## Writing layer `Carris_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/Carris_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer Carris_0000_stops
    ## Writing 1428 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `Carris_0000_shapes' failed
    ## Writing layer `Carris_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/Carris_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer Carris_0000_shapes
    ## Writing 86 features with 10 fields and geometry type Multi Line String.
    ## [1] "OPERATOR CarrisMetropolitana..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 4141 stops, 173 routes and 8090 stop times"
    ## [1] "> Merging stops with aggregated analysis (4141 rows)"
    ## [1] "> Merged: 4141 rows"
    ## [1] "> Merging shapes with aggregated analysis (255 rows)"
    ## [1] "> Merged: 255 rows"
    ## [1] "> Merged: 255 rows"
    ## [1] "> Merged: 255 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `CarrisMetropolitana_0000_stops' failed
    ## Writing layer `CarrisMetropolitana_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/CarrisMetropolitana_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer CarrisMetropolitana_0000_stops
    ## Writing 4141 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `CarrisMetropolitana_0000_shapes' failed
    ## Writing layer `CarrisMetropolitana_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/CarrisMetropolitana_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer CarrisMetropolitana_0000_shapes
    ## Writing 255 features with 10 fields and geometry type Multi Line String.
    ## [1] "OPERATOR MetroLisboa..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"

    ## Warning: GTFS has no shapes file, generating it...

    ## get_shapes() reconstructs the shapes table using euclidean approximation, based on the coordinates and sequence of stops for each trip, and may not be accurate.

    ## Joining with `by = join_by(trip_id)`
    ## Joining with `by = join_by(trip_id)`

    ## [1] "> Merging trips to add new shapes id (2514 rows)"
    ## [1] "> Merged: 2514 rows"
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"
    ## [1] "Filtered 68 stops, 4 routes and 714 stop times"
    ## [1] "> Merging stops with aggregated analysis (68 rows)"
    ## [1] "> Merged: 68 rows"
    ## [1] "> Merging shapes with aggregated analysis (8 rows)"
    ## [1] "> Merged: 8 rows"
    ## [1] "> Merged: 8 rows"
    ## [1] "> Merged: 8 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MetroLisboa_0000_stops' failed
    ## Writing layer `MetroLisboa_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/MetroLisboa_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer MetroLisboa_0000_stops
    ## Writing 68 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MetroLisboa_0000_shapes' failed
    ## Writing layer `MetroLisboa_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/MetroLisboa_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer MetroLisboa_0000_shapes
    ## Writing 8 features with 10 fields and geometry type Line String.
    ## [1] "OPERATOR MobiCascais..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 524 stops, 16 routes and 829 stop times"
    ## [1] "> Merging stops with aggregated analysis (524 rows)"
    ## [1] "> Merged: 524 rows"
    ## [1] "> Merging shapes with aggregated analysis (27 rows)"
    ## [1] "> Merged: 27 rows"
    ## [1] "> Merged: 27 rows"
    ## [1] "> Merged: 27 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MobiCascais_0000_stops' failed
    ## Writing layer `MobiCascais_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/MobiCascais_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer MobiCascais_0000_stops
    ## Writing 524 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MobiCascais_0000_shapes' failed
    ## Writing layer `MobiCascais_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/MobiCascais_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer MobiCascais_0000_shapes
    ## Writing 27 features with 10 fields and geometry type Multi Line String.
    ## [1] "OPERATOR MTS..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 19 stops, 3 routes and 170 stop times"
    ## [1] "> Merging stops with aggregated analysis (19 rows)"
    ## [1] "> Merged: 19 rows"
    ## [1] "> Merging shapes with aggregated analysis (6 rows)"
    ## [1] "> Merged: 6 rows"
    ## [1] "> Merged: 6 rows"
    ## [1] "> Merged: 6 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MTS_0000_stops' failed
    ## Writing layer `MTS_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/MTS_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer MTS_0000_stops
    ## Writing 19 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `MTS_0000_shapes' failed
    ## Writing layer `MTS_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/MTS_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer MTS_0000_shapes
    ## Writing 6 features with 10 fields and geometry type Line String.
    ## [1] "OPERATOR TCB..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 136 stops, 6 routes and 282 stop times"
    ## [1] "> Merging stops with aggregated analysis (136 rows)"
    ## [1] "> Merged: 136 rows"
    ## [1] "> Merging shapes with aggregated analysis (10 rows)"
    ## [1] "> Merged: 10 rows"
    ## [1] "> Merged: 10 rows"
    ## [1] "> Merged: 10 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `TCB_0000_stops' failed
    ## Writing layer `TCB_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/TCB_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer TCB_0000_stops
    ## Writing 136 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `TCB_0000_shapes' failed
    ## Writing layer `TCB_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/TCB_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer TCB_0000_shapes
    ## Writing 10 features with 10 fields and geometry type Multi Line String.
    ## [1] "OPERATOR CP..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"

    ## Warning: GTFS has no shapes file, generating it...

    ## get_shapes() reconstructs the shapes table using euclidean approximation, based on the coordinates and sequence of stops for each trip, and may not be accurate.
    ## Joining with `by = join_by(trip_id)`Joining with `by = join_by(trip_id)`

    ## [1] "> Merging trips to add new shapes id (1206 rows)"
    ## [1] "> Merged: 1206 rows"
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 55 stops, 12 routes and 214 stop times"
    ## [1] "> Merging stops with aggregated analysis (55 rows)"
    ## [1] "> Merged: 55 rows"
    ## [1] "> Merging shapes with aggregated analysis (12 rows)"
    ## [1] "> Merged: 12 rows"
    ## [1] "> Merged: 12 rows"
    ## [1] "> Merged: 12 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `CP_0000_stops' failed
    ## Writing layer `CP_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/CP_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer CP_0000_stops
    ## Writing 55 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `CP_0000_shapes' failed
    ## Writing layer `CP_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/CP_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer CP_0000_shapes
    ## Writing 12 features with 10 fields and geometry type Line String.
    ## [1] "OPERATOR Fertagus..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 14 stops, 2 routes and 47 stop times"
    ## [1] "> Merging stops with aggregated analysis (14 rows)"
    ## [1] "> Merged: 14 rows"
    ## [1] "> Merging shapes with aggregated analysis (3 rows)"
    ## [1] "> Merged: 3 rows"
    ## [1] "> Merged: 3 rows"
    ## [1] "> Merged: 3 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `Fertagus_0000_stops' failed
    ## Writing layer `Fertagus_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/Fertagus_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer Fertagus_0000_stops
    ## Writing 14 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `Fertagus_0000_shapes' failed
    ## Writing layer `Fertagus_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/Fertagus_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer Fertagus_0000_shapes
    ## Writing 3 features with 10 fields and geometry type Line String.
    ## [1] "OPERATOR TTSL..."
    ## [1] "Converting stop_times to make sure they don't pass 24:00..."
    ## [1] "Done!"
    ## [1] "DAY 2025-03-26..."
    ## [1] "-----------------------"
    ## [1] "Analysing GTFS for hour 00 (00:00:00, 00:59:59)..."
    ## [1] "---"

    ## Warning in filter_stop_times(gtfs_obj, extract_date, min_departure_time, : No
    ## transfers found in feed, travel_times() or raptor() might produce unexpected
    ## results

    ## [1] "Filtered 4 stops, 2 routes and 14 stop times"
    ## [1] "> Merging stops with aggregated analysis (4 rows)"
    ## [1] "> Merged: 4 rows"
    ## [1] "> Merging shapes with aggregated analysis (4 rows)"
    ## [1] "> Merged: 4 rows"
    ## [1] "> Merged: 4 rows"
    ## [1] "> Merged: 4 rows"

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `TTSL_0000_stops' failed
    ## Writing layer `TTSL_0000_stops' to data source 
    ##   `output/2025-03-26/GeoJSON/TTSL_0000_stops.geojson' using driver `GeoJSON'
    ## Updating existing layer TTSL_0000_stops
    ## Writing 4 features with 4 fields and geometry type Point.

    ## Warning in CPL_write_ogr(obj, dsn, layer, driver,
    ## as.character(dataset_options), : GDAL Error 6: DeleteLayer() not supported by
    ## this dataset.

    ## Deleting layer not supported by driver `GeoJSON'
    ## Deleting layer `TTSL_0000_shapes' failed
    ## Writing layer `TTSL_0000_shapes' to data source 
    ##   `output/2025-03-26/GeoJSON/TTSL_0000_shapes.geojson' using driver `GeoJSON'
    ## Updating existing layer TTSL_0000_shapes
    ## Writing 4 features with 10 fields and geometry type Line String.

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
