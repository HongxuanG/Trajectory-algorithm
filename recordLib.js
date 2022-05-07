/*
步骤：
1. 初始化
2. 
*/

/**
 * 
 * @param {object[]} histPtList 历史轨迹点列表 
 * @param {*} options 
 */

/* 轨迹回放 */
var RecordLib = function (histPtList, options) {
  var startTime = options.startTime; //开始时间
  var stopTime = options.stopTime; //结束时间
  var filtedTrack = [];
  var staticPts = [];
  var avgSpd = 0; //平均速度
  init();

  function init() {
    if (histPtList.length > 0) {
      filtedTrack = histPtList;
      if (options.no_smooth) {
        console.warn("滤波已取消");
      } else {
        // filtedTrack = filtedTrack_smoothstay(filtedTrack);
        // filtedTrack = filtTrack_timeout(histPtList);
        // filtedTrack = filtTrack_fly(filtedTrack);
        // 处理原始数据，减少遍历次数
        filtedTrack = doFilterTrack(filtedTrack);
        filtedTrack = filtTrack_debris(filtedTrack);
      }
      // 解析其中的停留点
      staticPts = filtTrack_parseStatic(filtedTrack);

      // calculateDist();
      // calculateRunTime();
      // avgSpd = calculateAvgSpd();
      avgSpd = calcTrack();

      console.debug(
        "过滤前长度" + histPtList.length + "过滤后长度" + filtedTrack.length
      );
    } else {
      console.warn("轨迹是空的");
    }
  }

  // longitude 经度
  // latitude  纬度
  /**
   * 获取两经纬度距离
   * @param {object} point1 起始点 
   * @param {object} point2 终止点
   * @returns {number} s 距离 单位（米）
   * 科普：
   * 本初子午线( 0° )所在平面和经度所在平面的夹角 称为经度
   * 赤道所在平面和纬度所在平面的夹角  称为纬度
   */

  function getDistance(point1, point2) {
    var lat1 = point1.lat,
      lng1 = point1.lng,
      lat2 = point2.lat,
      lng2 = point2.lng;
    var radLat1 = (lat1 * Math.PI) / 180.0;
    var radLat2 = (lat2 * Math.PI) / 180.0;
    var a = radLat1 - radLat2;
    var b = (lng1 * Math.PI) / 180.0 - (lng2 * Math.PI) / 180.0;
    var s =
      2 *
      Math.asin(
        Math.sqrt(
          Math.pow(Math.sin(a / 2), 2) +
            Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)
        )
      );
    s = s * 6378.137; // 地球半径，千米;
    s = Math.round(s * 10000) / 10000; //输出为公里
    s = Math.round(s * 1000) / 1; //单位修改为米,取整
    // s=s.toFixed(4);
    return s;
  }
  /**
   * 计算里程的平均速度
   */
  function calcTrack() {
    var totalDist = 0;
    var totalRunTime = 0;
    var spdCnt = 0;
    var spdSum = 0;
    if (filtedTrack.length === 0) return 0;
    filtedTrack[0].totalDist = 0;
    // 从索引值为 1 开始遍历
    for (var i = 1; i < filtedTrack.length; i++) {
      //计算上一个地理位置和当前地理位置的距离  
      var distance = getDistance(
        filtedTrack[i - 1].realPt,
        filtedTrack[i].realPt
      );
      if (isNaN(distance)) {
        distance = 0;
      }
      totalDist += distance;
      // 添加当前点到起始点的距离 totalDist 作为属性收集到 filtedTrack[i] 上
      filtedTrack[i].totalDist = totalDist;
      // 上一个点的速度是否大于 ？？？
      if (filtedTrack[i - 1].speed > 7) {
        // 当前时间戳减去上一个点的时间戳  累加赋值给  totalRunTime
        totalRunTime += filtedTrack[i].realTime - filtedTrack[i - 1].realTime;
      }
      // 添加当前点到起始点的时间差 totalRunTime 作为属性收集到 filtedTrack[i] 上
      filtedTrack[i].totalRunTime = totalRunTime;
      spdCnt++;
      spdSum += filtedTrack[i].speed;
    }
    // 计算平均运行速度
    if (spdCnt == 0) {
      return 0;
    }
    // 各个点的速度之和 / 点的数量
    return spdSum / spdCnt;
  }
  // 过滤
  function doFilterTrack(track) {
    // console.log(track);
    if (track.length == 0) {
      return track;
    }
    var newTrack = [];  // 过滤后的轨迹点列表
    var tag = true;
    var distLimit = 350;   // 两点之间最大距离限制是350米
    var prev_ts = track[0].realTime;   // 初始化 给上一个点的时间戳赋值为轨迹的第一个点的时间戳
    var prev_loc = track[0].realPt;    // 初始化 给上一个点的地理位置（经纬度）赋值为轨迹的第一个点的地理位置
    newTrack.push(track[0]);
    for (var i = 1; i < track.length; i++) {
      var currPt = track[i];
      // 这一段的时间戳的差值
      var dt = currPt.realTime - prev_ts;
      // 这一段的距离
      var d_dist = getDistance(currPt.realPt, prev_loc);
      // 这一段的千米每小时 时速
      var partKmh = (d_dist / (dt / 1000)) * 3.6;
      // 这段时间的
      var realKmh = currPt.speed;
      var eKmh = Math.abs(realKmh - partKmh);
      var reKmh = eKmh / partKmh;
      var isStatic = dt > 30 * 1000;   // 时间差大于30秒 认定为停留点
      var isFly = (reKmh > 0.5 && !isStatic) || (eKmh > 7 && isStatic);
      if (!isFly && d_dist <= distLimit && dt < 30 * 1000 && dt > 0) {
        //除去不正常的飘点
        if (currPt.speed <= 0 && tag) {
          newTrack.push(currPt);
          tag = false;
        } else if (currPt.speed > 0) {
          newTrack.push(currPt);
          tag = true;
        }
      }
      // 当前点赋值给上一个点，继续下一轮循环
      prev_ts = currPt.realTime;
      prev_loc = currPt.realPt;
    }
    if (newTrack[newTrack.length - 1] != track[track.length - 1]) {
      newTrack.push(track[track.length - 1]);
    }
    return newTrack;
  }
  // 连续停留点整合在一起
  function filtedTrack_smoothstay(track) {
    if (track.length == 0) {
      return track;
    }
    var newTrack = [];
    var tag = true;
    newTrack.push(track[0]);
    for (var i = 1; i < track.length; i++) {
      var currPt = track[i];
      if (currPt.speed <= 0 && tag) {
        newTrack.push(currPt);
        tag = false;
      } else if (currPt.speed > 0) {
        newTrack.push(currPt);
        tag = true;
      }
    }
    if (newTrack[newTrack.length - 1] != track[track.length - 1]) {
      newTrack.push(track[track.length - 1]);
    }
    console.log("整合停留点后", newTrack);
    return newTrack;
  }
  //清除时间异常点（静止时不应该上传点，因此超过30秒应该被视为无效点）
  function filtTrack_timeout(track) {
    if (track.length == 0) {
      return track;
    }
    var newTrack = [];
    var prev_ts = track[0].realTime;
    for (var i = 1; i < track.length; i++) {
      var currPt = track[i];
      var dt = currPt.realTime - prev_ts;
      //除了大于30秒的，还有重复的
      if (dt < 30 * 1000 && dt > 0) {
        newTrack.push(currPt);
      }
      prev_ts = currPt.realTime;
    }
    return newTrack;
  }
  // 识别飞点（根据瞬时速度与短时匀速的对比）
  function filtTrack_fly(track) {
    if (track.length == 0) {
      return track;
    }
    var newTrack = [];
    var prev_ts = track[0].realTime;
    var prev_loc = track[0].realPt;
    for (var i = 1; i < track.length; i++) {
      var currPt = track[i];
      var dt = currPt.realTime - prev_ts;
      var d_dist = getDistance(currPt.realPt, prev_loc);
      var partKmh = (d_dist / (dt / 1000)) * 3.6;   // 当前相邻两点的平均速度
      var realKmh = currPt.speed;              // 当前点的瞬时速度
      var eKmh = Math.abs(realKmh - partKmh);
      var reKmh = eKmh / partKmh;
      var isStatic = dt > 30 * 1000;
      var isFly = (reKmh > 0.5 && !isStatic) || (eKmh > 7 && isStatic);
      if (!isFly) {
        newTrack.push(currPt);
      }
      prev_ts = currPt.realTime;
      prev_loc = currPt.realPt;
    }
    return newTrack;
  }
  // 去除碎片
  function filtTrack_debris(track) {
    if (track.length == 0) {
      return track;
    }
    var newTrack = [];
    var fragment_start = 0;   // 碎片开始的索引值
    var fragment_len = 0;     // 碎片的长度
    for (var i = 0; i < track.length; i++) {
      var currPt = track[i];
      if (i == 0) {
        fragment_start = i;
      } else if (track[i - 1].index + 1 != currPt.index) { // 说明两点之间有被过滤的点
        fragment_start = i;
      }
      var doPush = false;
      if (i == track.length - 1) {
        fragment_len = i + 1 - fragment_start;
        if (fragment_len > 3) doPush = true;
      } else if (track[i + 1].index - 1 != currPt.index) {
        fragment_len = i + 1 - fragment_start;
        if (fragment_len > 3) doPush = true;
      }
      if (doPush) {
        for (var j = 0; j < fragment_len; j++) {
          // 不把碎片段 push 进新数组里面
          newTrack.push(track[fragment_start + j]);
        }
      }
    }
    return newTrack;
  }
  /**
   * 识别静止点
   * @param {object[]} track 轨迹点列表
   * @returns {
        position: "",
        prevTime: track[track.length - 1].realTime,
        realTime: stopTime,
        pt: track[track.length - 1].baiduPt,
        t: dTime,
        idx: track.length - 1,
      }
   */
  function filtTrack_parseStatic(track) {
    if (track.length == 0) {
      return [];
    }
    var staticPt = [];
    var prev_loc = track[0].realPt;
    var prev_time = track[0].realTime;
    var dTime = 0;
    for (var i = 1; i < track.length; i++) {
      var currPt = track[i];
      var realDist = getDistance(currPt.realPt, prev_loc);
      dTime = currPt.realTime - prev_time;
      var realSpd = currPt.speed;
      var expSpd = (realDist / dTime) * 3600;
      var errRatio = expSpd / realSpd;
      //判定上一帧为静止点
      if (dTime > 60 * 1000 && errRatio < 0.2) {
        var point = {
          position: "",
          prevTime: prev_time,
          realTime: currPt.realTime,
          pt: track[i - 1].baiduPt,
          t: dTime,
          idx: i - 1,
        };
        staticPt.push(point);
        // console.debug("检测到静止点", point);
      }
      prev_loc = currPt.realPt;
      prev_time = currPt.realTime;
    }
    dTime = stopTime - track[track.length - 1].realTime;
    if (dTime > 60 * 1000) {
      staticPt.push({
        position: "",
        prevTime: track[track.length - 1].realTime,
        realTime: stopTime,
        pt: track[track.length - 1].baiduPt,
        t: dTime,
        idx: track.length - 1,
      });
    }
    return staticPt;
  }
  // 计算里程
  function calculateDist() {
    var totalDist = 0;
    if (filtedTrack.length === 0) return 0;
    filtedTrack[0].totalDist = 0;
    for (var i = 1; i < filtedTrack.length; i++) {
      var distance = getDistance(
        filtedTrack[i - 1].realPt,
        filtedTrack[i].realPt
      );
      if (isNaN(distance)) {
        distance = 0;
      }
      totalDist += distance;
      filtedTrack[i].totalDist = totalDist;
    }
    return totalDist;
  }
  /**
   * 计算运行时长
   * @returns{number}
   */
  function calculateRunTime() {
    var totalRunTime = 0;
    if (filtedTrack.length === 0) return 0;
    filtedTrack[0].totalRunTime = 0;
    for (var i = 1; i < filtedTrack.length; i++) {
      if (filtedTrack[i - 1].speed > 7) {
        totalRunTime += filtedTrack[i].realTime - filtedTrack[i - 1].realTime;
      }
      filtedTrack[i].totalRunTime = totalRunTime;
    }
    return totalRunTime;
  }
  //计算平均速度
  function calculateAvgSpd() {
    var spdCnt = 0;
    var spdSum = 0;
    for (var i = 1; i < filtedTrack.length; i++) {
      spdCnt++;
      spdSum += filtedTrack[i].speed;
    }
    if (spdCnt == 0) {
      return 0;
    }
    return spdSum / spdCnt;
  }
  //对外接口----------------------------------------------//获取轨迹点的数量
  this.getFiltedPtsCnt = function () {
    return filtedTrack.length;
  };
  //获取轨迹点数组
  this.getFiltedTrack = function () {
    return filtedTrack;
  };
  //获取index位置的轨迹点
  this.getFiltedTrackIndex = function (index) {
    if (index < filtedTrack.length) {
      return filtedTrack[index];
    } else {
      return null;
    }
  };
  //获取轨迹点数组的位置信息数组
  this.getFiltedPoints = function () {
    var ptList = [];
    for (var i = 0; i < filtedTrack.length; i++) {
      ptList.push(filtedTrack[i].baiduPt);
    }
    return ptList;
  };
  //获取静止点
  this.getStaticPoints = function () {
    return staticPts;
  };
  //获取超速点
  this.getOverspeedPoints = function (spdLimit) {
    var ovPts = [];
    for (let i = 0; i < filtedTrack.length; i++) {
      if (filtedTrack[i].speed > spdLimit) {
        let ovPt = filtedTrack[i];
        ovPt.idx = i;
        ovPts.push(ovPt);
      }
    }
    return ovPts;
  };
  //获取总里程
  this.getTotalDist = function () {
    if (filtedTrack.length == 0) {
      return 0;
    } else {
      return filtedTrack[filtedTrack.length - 1].totalDist;
    }
  };
  //获取平均速度
  this.getAvgSpeed = function () {
    return avgSpd;
  };
};
export default RecordLib;
