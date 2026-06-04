using System;
using PTT.Data;
using PTT.Helpers;
using EFT.Interactive;
using System.Collections.Generic;

namespace PTT.Services;

public class CurrentLocationDataService
{
    private CurrentLocationDataResponse CurrentLocationData { get; set; } = new CurrentLocationDataResponse();
    private bool _isInitialized = false;
    private bool _fetchSucceeded = false;

    public bool Init()
    {
        if (_isInitialized)
        {
            Logger.Info("CurrentLocationDataService already initialized, skipping");
            return _fetchSucceeded;
        }
        _fetchSucceeded = FetchExfilsTargetsForCurrentLocation();
        _isInitialized = true;

        if (_fetchSucceeded)
        {
            PTT.Patches.InitAllExfiltrationPointsPatch.TryApplyExfilFiltering();
        }
        else
        {
            Logger.Warning("CurrentLocationDataService init failed — vanilla exfils preserved as fallback");
        }
        return _fetchSucceeded;
    }

    public bool DidFetchSucceed()
    {
        return _fetchSucceeded;
    }

    public bool IsInitialized()
    {
        return _isInitialized;
    }

    public bool IsExfiltrationPointEnabled(ExfiltrationPoint exfil)
    {
        string exitName = exfil?.Settings?.Name ?? null;

        if (exitName == null)
        {
            return false;
        }

        return CurrentLocationData?.exfilsTargets != null && CurrentLocationData.exfilsTargets.ContainsKey(exitName);
    }

    public List<ExfilTarget> GetExfilTargets(ExfiltrationPoint exfil)
    {
        if (exfil == null)
        {
            return null;
        }

        string exitName = exfil?.Settings?.Name ?? null;

        if (exitName == null)
        {
            Logger.Error("GetExfilTargets cannot retrieve exitName from exfil");
            return null;
        }

        if (CurrentLocationData?.exfilsTargets == null || !CurrentLocationData.exfilsTargets.TryGetValue(exitName, out List<ExfilTarget> exfilTargets))
        {
            Logger.Warning($"cannot retrieve exfil targets for exfil '{exitName}'");
            return null;
        }

        return exfilTargets;
    }

    private bool FetchExfilsTargetsForCurrentLocation()
    {
        string locationId = LocalRaidSettingsRetriever.RaidSettings.location;

        if (locationId == null || locationId == "")
        {
            Logger.Error($"Fatal Error: no LocationId found in GameWorld");
            return false;
        }

        try
        {
            Logger.Info($"calling FetchExfilsTargets for locationId {locationId}");
            CurrentLocationData = HttpRequest.FetchCurrentLocationData(locationId);
            if (CurrentLocationData?.exfilsTargets == null || CurrentLocationData.exfilsTargets.Count == 0)
            {
                Logger.Warning($"FetchExfilsTargets returned empty data for {locationId}");
                return false;
            }
            Logger.Info($"FetchExfilsTargets successfully called");
            return true;
        }
        catch (Exception ex)
        {
            Logger.Error($"Error occurred during request: {ex.Message}");
            return false;
        }
    }

    public void Reset()
    {
        _isInitialized = false;
        _fetchSucceeded = false;
        CurrentLocationData = new CurrentLocationDataResponse();
    }
}